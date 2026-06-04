import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { getQaUrl } from "@/lib/card-url";
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
  const { ko, en } = resolved;
  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) return { title: `${ko} 시술 리포트`, robots: { index: false, follow: true } };

  const url = `${SITE_URL}/reports/${en}`;
  const desc = `${ko} 시술 회원 후기 ${report.count}건 집계 — 평균 만족도 ${report.avgSatisfaction.toFixed(
    1,
  )}/5, 재시술 의향·통증·체감 효과 정리.`;
  return {
    title: `${ko} 후기 ${report.count}건 — 만족도·통증·재시술 정리`,
    description: desc,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: `${ko} 시술 후기 리포트`, description: desc, url, type: "article" },
  };
}

export default async function ProcedureReportPage({ params }: Props) {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) notFound();
  const { ko } = resolved;

  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 개별 후기 스트림 — 같은 시술(keywords 포함) 발행 후기. CARD_LIST_SELECT(요약 임베드 포함).
  // 작업 A: 첫 10개만 서버 렌더(크롤러·비로그인 노출) + 전체 count → 무한스크롤 hasMore 판정.
  const PAGE_SIZE = 10;
  const reviewQuery = supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("category", "review")
    .eq("status", "published")
    .is("deleted_at", null)
    .contains("keywords", [ko])
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1)
    .returns<CardData[]>();
  const countQuery = supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("category", "review")
    .eq("status", "published")
    .is("deleted_at", null)
    .contains("keywords", [ko]);
  const [{ data: reviewData }, { count: reviewTotal }] = await Promise.all([
    reviewQuery,
    countQuery,
  ]);
  const reviews = reviewData ?? [];

  // 하단 "관련 전문의 Q&A" 역링크 — 같은 시술 키워드의 발행 Q&A 카드 상위 6.
  const { data: relatedQaData } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("type", "qa")
    .eq("status", "published")
    .is("deleted_at", null)
    .contains("keywords", [ko])
    .order("created_at", { ascending: false })
    .range(0, 5)
    .returns<CardData[]>();
  const relatedQa = relatedQaData ?? [];

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

  // JSON-LD — AggregateRating (별점·후기 수). 시술 리포트 인덱싱 신호.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${ko} 시술`,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: report.avgSatisfaction.toFixed(1),
      bestRating: 5,
      worstRating: 1,
      ratingCount: report.count,
      reviewCount: report.count,
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

      {/* 관련 전문의 Q&A — 같은 시술 키워드의 발행 Q&A 역링크. */}
      {relatedQa.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-bold text-[var(--text)]">
            {ko} 관련 전문의 Q&amp;A
          </h2>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white">
            {relatedQa.map((qa) => (
              <li key={qa.id}>
                <Link
                  href={getQaUrl(qa)}
                  className="block px-4 py-3 transition-colors hover:bg-[var(--bg-soft)]"
                >
                  <span className="line-clamp-2 text-[14px] font-semibold text-[var(--text)]">
                    {qa.title}
                  </span>
                  {qa.doctor?.name && (
                    <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
                      {qa.doctor.name}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
