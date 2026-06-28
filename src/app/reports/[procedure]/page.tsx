import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport, getFamilyReviewCardIds } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { topKeywords } from "@/components/skin/feed-sidebar-data";
import ProcedureReportView from "./ProcedureReportView";

/** 홈 피드와 동일한 사이드바 데이터(인기태그·인기 Q&A) — feed_cards_scored 비검색 풀 기준.
 *   홈 page.tsx 의 비검색 분기와 동일 RPC·동일 파라미터. published 공개 카드만(RPC + RLS, 우회 없음). */
async function fetchFeedSidebarData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ popularTags: string[]; hotQa: CardData[] }> {
  const { data, error } = await supabase.rpc("feed_cards_scored", {
    p_limit: 300,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0, // 인기태그 풀은 결정적(클릭/재방문에 목록 불변)
  });
  if (error) {
    console.error("[reports] 사이드바 피드 풀 조회 실패:", error.message);
    return { popularTags: [], hotQa: [] };
  }
  const scored = (data ?? []) as CardData[];
  const popularTags = topKeywords(scored);
  const hotQa = scored
    .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
    .slice(0, 20);
  return { popularTags, hotQa };
}

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

// param 은 영문 슬러그(taxonomy.en) 또는 기존 한글(ko) 둘 다 허용 — 한글 URL 비파괴.
// en 은 소문자 매칭, ko 는 원문 매칭. 미존재만 null(→404). ko 는 후기 스트림·집계·JSON-LD,
// en 은 canonical·내부 링크에 사용.
// PostgREST `.or()` 는 문자열 파서라 `,` `.` `()` 등 메타문자로 필터 구조 조작 표면이 있다.
//   `.or()` 보간 직전 입력 화이트리스트 게이트 — middleware.ts(reports redirect) /
//   identity-shared.ts(bundleProfileFilter) 와 동일 방어 스타일. 시술명은 한글이므로
//   한글·영문소문자대문자·숫자·공백·하이픈·가운뎃점만 허용(한글 정식 URL 비파괴).
const PROCEDURE_SLUG_RE = /^[가-힣a-zA-Z0-9 ·-]+$/;

async function resolveProcedure(
  raw: string,
): Promise<{ ko: string; en: string } | null> {
  const v = decodeURIComponent(raw).trim();
  if (!v) return null;
  // 화이트리스트 미충족(메타문자 포함 등) → 조회 없이 미존재 취급(페이지는 notFound()).
  if (!PROCEDURE_SLUG_RE.test(v)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tag_dictionary")
    .select("ko, en")
    .or(`en.eq.${v.toLowerCase()},ko.eq.${v}`)
    .eq("is_procedure", true)
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
    // 2026-06-16: openGraph/twitter 인라인 작성 → lib/og-meta.ts 헬퍼로 정합화.
    //   OG 이미지(기본 /og.png, 의사별 커스텀 없음 → null) + twitter card=summary_large_image.
    ...buildSocialMeta({
      title,
      description: desc,
      canonical: url,
      ogImage: buildOgImage(null),
      ogType: "article",
    }),
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

  // report 를 먼저 단독 await → 없으면 notFound() 로 즉시 종료(존재하지 않는 시술 슬러그·크롤러
  //   요청 시 cardIds·idxTags·sidebar 3개 쿼리를 헛돌리지 않는다). report 확정 후 나머지 3개는
  //   서로 독립이라 한 번의 Promise.all 로 묶어 워터폴 제거(reviews(d)만 cardIds 의존이라 뒤에 둔다).
  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();
  const [cardIds, { data: idxTags }, sidebarData] = await Promise.all([
    getFamilyReviewCardIds(supabase, ko),
    supabase.rpc("get_indexable_tags", { p_min_count: 4 }),
    fetchFeedSidebarData(supabase),
  ]);

  // 개별 후기 스트림 — 작업 D 롤업: 집계와 동일한 procedure_ko family 기준(카드 id IN).
  //   작업 A: 첫 10개만 서버 렌더(크롤러·비로그인 노출) + 전체 count → 무한스크롤 hasMore 판정.
  const PAGE_SIZE = 10;
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
  //   idxTags·sidebarData 는 위 Promise.all 에서 report·cardIds 와 함께 선조회.
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
    // @graph — MedicalWebPage + BreadcrumbList 를 독립 노드로 분리(Google 리치결과 인식↑).
    //   datePublished 는 리포트가 실시간 집계(저장된 발행일 없음)라 생략 — 가짜 날짜 미기입.
    "@graph": [
      {
        "@type": "MedicalWebPage",
        "@id": `${url}#webpage`,
        name: `${ko} 후기 리포트 | 피부텐텐`,
        url,
        inLanguage: "ko-KR",
        // 사이트 #website 노드 연결(doctor 라우트와 동일 패턴) — 페이지 그래프 결속.
        isPartOf: { "@id": `${SITE_URL}/#website` },
        // 게시 책임 주체 — 전역 layout 의 #organization(SSOT) 참조만(노드 재정의 금지 → @id 충돌 0).
        publisher: { "@id": `${SITE_URL}/#organization` },
        // 집계 갱신 신호 — 요청 시점(실시간 집계라 항상 최신). AI freshness.
        dateModified: new Date().toISOString(),
        mainEntity: {
          "@type": "Service",
          additionalType: "https://schema.org/MedicalProcedure",
          name: ko,
          // tag_dictionary(is_procedure=true) 에서 파생한 category 값 그대로(lifting/skinbooster/filler/contour/laser/other). 미분류면 생략.
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
        // BreadcrumbList 는 @graph 독립 노드 → @id 참조.
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_URL}/` },
          // /reports 허브(인덱스) 존재(200) → item 링크 부여(예전 name-only 깨진링크 방지 주석 폐기).
          { "@type": "ListItem", position: 2, name: "시술 리포트", item: `${SITE_URL}/reports` },
          { "@type": "ListItem", position: 3, name: ko, item: url },
        ],
      },
    ],
  };

  // JSON-LD <script> 는 server 에 남겨 SEO 신호 100% 보존. 본문은 앱 셸(AppShell)로
  //   감싼 ProcedureReportView 가 표시(정보 구조·데이터 무변경). DoctorDashboardView 선례 동일 패턴.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <ProcedureReportView
        ko={ko}
        report={report}
        reviews={reviews}
        reviewLiked={reviewLiked}
        reviewTotal={reviewTotal}
        topicsExists={topicsExists}
        popularTags={sidebarData.popularTags}
        hotQa={sidebarData.hotQa}
      />
    </>
  );
}
