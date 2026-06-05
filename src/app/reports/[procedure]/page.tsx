import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport, getFamilyReviewCardIds } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import BackButton from "@/components/BackButton";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import ReportSampleNotice from "@/components/report/ReportSampleNotice";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

// param 은 영문 슬러그(taxonomy.en) 또는 기존 한글(ko) 둘 다 허용 — 한글 URL 비파괴.
// en 은 소문자 매칭, ko 는 원문 매칭. 미존재만 null(→404). ko 는 후기 스트림·집계·JSON-LD,
// en 은 canonical·내부 링크에 사용.
async function resolveProcedure(
  raw: string,
): Promise<{ ko: string; en: string } | null> {
  const v = decodeURIComponent(raw).trim();
  if (!v) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("procedure_taxonomy")
    .select("ko, en")
    .or(`en.eq.${v.toLowerCase()},ko.eq.${v}`)
    .eq("active", true)
    .maybeSingle<{ ko: string; en: string }>();
  return data ? { ko: data.ko, en: data.en } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) return { title: "찾을 수 없는 시술 리포트" };
  const { ko } = resolved;
  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) return { title: `${ko} 시술 리포트`, robots: { index: false, follow: true } };

  // canonical = 한글 슬러그 (2026-06-05). 영문 en 은 308 로 한글로 보내는 리다이렉트 전용.
  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
  // 주제(시술·후기수) first · 브랜드("피부텐텐 리포트") last. 수치 전부 라이브 집계.
  const title = `${ko} 후기 ${report.count}건 | 피부텐텐 리포트`;
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const revisitPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;
  const desc = `재시술 의향 ${revisitPct}% · 평균 만족도 ${report.avgSatisfaction.toFixed(
    1,
  )}/5 · 통증·다운타임까지 실제 경험자 데이터로 정리.`;
  return {
    // absolute — 루트 레이아웃 "피부텐텐 | %s" 템플릿 중복 방지(이미 '피부텐텐 리포트' 포함).
    title: { absolute: title },
    description: desc,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description: desc, url, type: "article" },
    twitter: { card: "summary", title, description: desc },
  };
}

export default async function ProcedureReportPage({ params }: Props) {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) notFound();
  const { ko } = resolved;

  // 영문 en → 한글 ko 308 영구 리다이렉트는 middleware.ts 가 처리(페이지 레벨 redirect 는
  //   스트리밍 SSR 에서 200+meta-refresh 로 폴백 → 하드 308 불가). 이 페이지는 ko 만 받는다.

  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 개별 후기 스트림 — 작업 D 롤업: 집계와 동일한 procedure_ko family 기준(카드 id IN).
  //   작업 A: 첫 10개만 서버 렌더(크롤러·비로그인 노출) + 전체 count → 무한스크롤 hasMore 판정.
  const PAGE_SIZE = 10;
  const cardIds = await getFamilyReviewCardIds(supabase, ko);
  const reviewTotal = cardIds.length;
  const reviews: CardData[] =
    cardIds.length > 0
      ? ((
          await supabase
            .from("cards")
            .select(CARD_LIST_SELECT)
            .in("id", cardIds)
            .order("created_at", { ascending: false })
            .range(0, PAGE_SIZE - 1)
            .returns<CardData[]>()
        ).data ?? [])
      : [];

  // 시술 리포트 후기 — viewer 좋아요 여부 일괄 조회(단독 글과 같은 card_likes 행).
  const reviewLiked: Record<number, boolean> = {};
  if (reviews.length > 0) {
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    const st = await fetchViewerStatesRecord(
      supabase,
      viewer?.id ?? null,
      reviews.map((r) => r.id),
    );
    for (const r of reviews) reviewLiked[r.id] = !!st[r.id]?.liked;
  }

  // /topics(전문의 Q&A 허브) 얇은 링크 — 실제 존재(의사 qa ≥4 = get_indexable_tags 포함)할 때만.
  //   /topics 의 404 게이트(MIN_DOCTOR_POSTS=4)와 동일 기준 → 깨진 링크 0. 정적 링크 1줄
  //   (2026-06-04 제거된 '관련 전문의 Q&A' 섹션·orphan qa fetch 부활 아님).
  const { data: idxTags } = await supabase.rpc("get_indexable_tags", { p_min_count: 4 });
  const topicsExists =
    Array.isArray(idxTags) &&
    (idxTags as Array<{ keyword: string }>).some((t) => t.keyword === ko);

  // JSON-LD — MedicalWebPage + Service(MedicalProcedure) (2026-06-05, Product 폐기).
  //   의료 시술에 Product 스키마는 구글 정책 오용 소지 → 의료 페이지 + 시술(Service) 로 전환.
  //   별점(AggregateRating)·재시술%·통증은 페이지·AI 인용 신호로 유지. 모든 수치 라이브 집계.
  //   provider 는 layout 의 Organization(@id #organization) 참조만(신규 정의 없음).
  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const revisitPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name: `${ko} 후기 리포트 | 피부텐텐`,
    url,
    // 집계 갱신 신호 — 요청 시점(실시간 집계라 항상 최신). AI freshness.
    dateModified: new Date().toISOString(),
    mainEntity: {
      "@type": "Service",
      additionalType: "https://schema.org/MedicalProcedure",
      name: ko,
      // procedure_taxonomy.category 값 그대로(lifting/injectables). 미분류면 생략.
      ...(report.category ? { category: report.category } : {}),
      provider: { "@id": `${SITE_URL}/#organization` },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: report.avgSatisfaction.toFixed(1),
        bestRating: 5,
        ratingCount: report.count,
      },
      additionalProperty: [
        { "@type": "PropertyValue", name: "재시술 의향", value: `${revisitPct}%` },
        {
          "@type": "PropertyValue",
          name: "평균 통증",
          value: Number(report.avgPain.toFixed(1)),
          maxValue: 5,
        },
      ],
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_URL}/` },
        // /reports 인덱스 페이지 없음 → 중간 크럼브는 name-only(깨진 링크 방지).
        { "@type": "ListItem", position: 2, name: "시술 리포트" },
        { "@type": "ListItem", position: 3, name: ko, item: url },
      ],
    },
  };

  return (
    <section className="mx-auto w-full max-w-[680px] py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/" />
      </div>

      <ReportSampleNotice count={report.count} procedureKo={report.procedureKo} />
      <ProcedureReportCard
        report={report}
        reviews={reviews}
        reviewLiked={reviewLiked}
        defaultExpanded
        variant="page"
        total={reviewTotal ?? reviews.length}
      />

      {/* 전문의 Q&A 허브 얇은 링크 — /topics 가 존재(의사 qa ≥4)할 때만. 한글 직접 타깃. */}
      {topicsExists && (
        <div className="mt-5">
          <Link
            href={`/topics/${encodeURIComponent(ko)}`}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]"
          >
            <span>
              <b className="text-[var(--primary)]">{ko}</b> 전문의 Q&A 보기
            </span>
            <span aria-hidden className="text-[var(--text-muted)]">→</span>
          </Link>
        </div>
      )}
    </section>
  );
}
