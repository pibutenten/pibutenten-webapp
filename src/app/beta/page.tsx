import type { Metadata } from "next";
import { headers } from "next/headers";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { isPostCategorySlug, labelForCategory } from "@/lib/post-category";

/**
 * /beta 피드 — 홈과 동일한 실제 Feed/Card(2열) + 상단 카테고리 선택.
 *  - 전체: feed_cards_scored + 리포트 주입
 *  - Q&A/시술후기/끄적끄적: fetchCardList(q=라벨) → category 필터 (무한스크롤 동일)
 *  - 리포트: 실제 ProcedureReportCard(통계형) 그대로
 * 카테고리 전환 시 Feed 는 key 로 리마운트(첫 initial 고정 문제 해소). noindex.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "피부텐텐 베타 (검토용)",
  robots: { index: false, follow: false },
};

const PAGE = 20;

export default async function BetaFeedPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const cat = sp.cat ?? "";
  const query = (sp.q ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();

  // ── 리포트: 실제 ProcedureReportCard(통계형). 검색 중이면 시술명(한글/영문) 부분일치로 필터 — 검색어 유지. ──
  if (cat === "review_summary") {
    const pool = await getReviewSummaryFeedPool(supabase);
    const ql = query.toLowerCase();
    const reports = query
      ? pool.filter((r) => r.procedureKo.includes(query) || r.en.toLowerCase().includes(ql))
      : pool;
    // 검색어 로그(인기검색어 통계용) — 카드 검색과 동일 패턴, fire-and-forget.
    if (query && query.length <= 100) {
      void supabase.from("search_logs").insert({ query, profile_id: viewer?.id ?? null }).then(() => { /* 실패해도 진행 */ });
    }
    return (
      <div className="pb-16 sm:pb-0">
        <h1 className="sr-only">피부텐텐 베타 — 시술 리포트</h1>
        {reports.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">{query ? `‘${query}’ 검색 결과가 없습니다.` : "집계된 리포트가 없습니다."}</div>
        ) : (
          // 리포트 카드 목록 — 피드와 동일하게 데스크탑 2열(모바일 1열).
          <div className="sm:columns-2 sm:gap-4">
            {reports.map((r) => (
              <div key={r.anchor?.id ?? r.en} className="mb-4 break-inside-avoid">
                <ProcedureReportCard report={r} feedHref={`/reports/${encodeURIComponent(r.procedureKo)}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 그 외: 실제 Feed ──
  const ua = (await headers()).get("user-agent") ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);

  let cards: CardData[] = [];
  let searchQuery: string | undefined;
  let reportPool: ProcedureReport[] = [];

  // 검색 중 카테고리 탭(전체 외) — 검색어 유지하며 해당 카테고리만. 리포트(review_summary)는 칩이 q 를 떼므로 여기 안 옴.
  const searchCategory = query && isPostCategorySlug(cat) && cat !== "review_summary" ? cat : undefined;

  if (query) {
    // 검색어 로그(인기검색어 통계용) — /search 와 동일 패턴, fire-and-forget.
    if (query.length <= 100) {
      void supabase.from("search_logs").insert({ query, profile_id: viewer?.id ?? null }).then(() => { /* 실패해도 검색 진행 */ });
    }
    // 상단 검색창 입력 — 기존 검색 메커니즘(fetchCardList → search_cards_scored, 무한스크롤 동일).
    //   카테고리 탭이 함께면 p_category 로 좁힘(무한스크롤도 ?cat= 동일 전달).
    searchQuery = query;
    const { data } = await fetchCardList(supabase, { q: query, category: searchCategory, offset: 0, limit: PAGE });
    cards = (data ?? []) as unknown as CardData[];
  } else if (isPostCategorySlug(cat)) {
    const label = labelForCategory(cat);
    searchQuery = label;
    const { data } = await fetchCardList(supabase, { q: label, offset: 0, limit: PAGE });
    cards = (data ?? []) as unknown as CardData[];
  } else {
    const rpcRes = await supabase.rpc("feed_cards_scored", { p_limit: PAGE, p_offset: 0, p_half_life_days: 14, p_jitter_amp: 0.35 });
    cards = (rpcRes.data ?? []) as CardData[];
    cards = diversifyByDoctor(cards, { maxPerDoctorInHead: 1, headSize: 4 });
    reportPool = await getReviewSummaryFeedPool(supabase);
  }

  const hotIds = Array.from(await getHotQaIds(20));
  const viewerStates = await fetchViewerStatesRecord(supabase, viewer?.id ?? null, cards.map((q) => q.id));

  return (
    <div className="pb-16 sm:pb-0">
      <h1 className="sr-only">피부텐텐 베타 피드</h1>
      {cards.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">표시할 글이 없습니다.</div>
      ) : (
        <Feed
          key={query ? `q:${query}:${searchCategory ?? ""}` : cat || "all"}
          initial={cards}
          pageSize={PAGE}
          searchQuery={searchQuery}
          category={searchCategory}
          hotIds={hotIds}
          viewerStates={viewerStates}
          enableJustPublished={!searchQuery}
          reportPool={reportPool}
          initialMobile={isMobileUA}
        />
      )}
    </div>
  );
}
