import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport, getFamilyReviewCardIds } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import ReportsNewDetailView from "./ReportsNewDetailView";

/**
 * /reports-new/[시술] — 시술 전체 리포트 개선판 (임시 라우트, 서버 컴포넌트).
 *
 * 정식 /reports/[procedure](공용 ProcedureReportView, 다른 세션 작업 중)와 별개로,
 * 목업(전달용/thermage-report.html)의 풀 에디토리얼 리포트를 독립 구현해 검토용으로 올린다.
 *   - 데이터는 동일 함수(getProcedureReport)만 재사용(공용 뷰/카드 비의존).
 *   - 임시라 noindex + JSON-LD 없음(정식 페이지와 색인·구조화 데이터 중복 방지).
 *   - 승격 시 정식 /reports/[procedure]로 통합 예정.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

// 정식 페이지와 동일 화이트리스트(.or() 보간 방어). 한글 URL 비파괴.
const PROCEDURE_SLUG_RE = /^[가-힣a-zA-Z0-9 ·-]+$/;

async function resolveProcedure(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  raw: string,
): Promise<{ ko: string; en: string } | null> {
  const v = decodeURIComponent(raw).trim();
  if (!v || !PROCEDURE_SLUG_RE.test(v)) return null;
  const { data } = await supabase
    .from("tag_dictionary")
    .select("ko, en")
    .or(`en.eq.${v.toLowerCase()},ko.eq.${v}`)
    .eq("is_procedure", true)
    .maybeSingle<{ ko: string; en: string }>();
  return data ? { ko: data.ko, en: data.en } : null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "시술 리포트 (미리보기) | 피부텐텐" },
    description: "시술 전체 리포트 개선판 미리보기입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function ReportsNewDetailPage({ params }: Props) {
  const { procedure } = await params;
  const supabase = await createSupabaseServerClient();

  const resolved = await resolveProcedure(supabase, procedure);
  if (!resolved) notFound();
  const { ko, en } = resolved;

  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 후기 첫 10개 서버 렌더 + 전체 count(더 보기 판정). 정식 페이지와 동일 family 롤업.
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

  // 전문의 Q&A 얇은 링크 — 실제 존재(의사 qa ≥4)할 때만(정식 페이지와 동일 게이트).
  const { data: idxTags } = await supabase.rpc("get_indexable_tags", {
    p_min_count: 4,
  });
  const topicsExists =
    Array.isArray(idxTags) &&
    (idxTags as Array<{ keyword: string }>).some((t) => t.keyword === ko);

  return (
    <ReportsNewDetailView
      ko={ko}
      en={en}
      report={report}
      reviews={reviews}
      reviewLiked={reviewLiked}
      reviewTotal={reviewTotal}
      topicsExists={topicsExists}
    />
  );
}
