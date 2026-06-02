import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import BackButton from "@/components/BackButton";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import ProcedureReviewStream from "@/components/report/ProcedureReviewStream";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

async function resolveProcedure(raw: string): Promise<string | null> {
  const ko = decodeURIComponent(raw).trim();
  if (!ko) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("procedure_taxonomy")
    .select("ko")
    .eq("ko", ko)
    .eq("active", true)
    .maybeSingle();
  return data?.ko ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure } = await params;
  const ko = await resolveProcedure(procedure);
  if (!ko) return { title: "찾을 수 없는 시술 리포트" };
  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) return { title: `${ko} 시술 리포트`, robots: { index: false, follow: true } };

  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
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
  const ko = await resolveProcedure(procedure);
  if (!ko) notFound();

  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 개별 후기 스트림 — 같은 시술(keywords 포함) 발행 후기. CARD_LIST_SELECT(요약 임베드 포함).
  const { data: reviewData } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("category", "review")
    .eq("status", "published")
    .contains("keywords", [ko])
    .order("created_at", { ascending: false })
    .returns<CardData[]>();
  const reviews = reviewData ?? [];

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    reviews.map((r) => r.id),
  );

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

      <ProcedureReportCard report={report} />

      <ProcedureReviewStream reviews={reviews} viewerStates={viewerStates} />
    </section>
  );
}
