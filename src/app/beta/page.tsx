import type { Metadata } from "next";
import { headers } from "next/headers";
import BetaFeed from "@/components/beta/BetaFeed";
import type { CardDataList } from "@/components/Card";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";

/**
 * /beta 피드 — "한 번에 300개 점수순으로 받아두고, 탭은 BetaFeed 가 브라우저에서 즉시 필터" 모델.
 *  - 전체: feed_cards_scored 300 (+ 리포트풀) — 탭(Q&A/시술후기/끄적끄적)은 이 풀을 클라 필터.
 *  - 검색(?q=): search_cards_scored 300 — 검색 결과 풀을 같은 방식으로 탭 필터(검색바·URL 유지).
 *  - 리포트 탭: BetaFeed 가 reportPool 로 렌더(검색 중이면 시술명 필터).
 *  탭 전환은 서버 왕복 없음(클라 store) → 동그라미 없이 즉시. noindex.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "피부텐텐 베타 (검토용)",
  robots: { index: false, follow: false },
};

const POOL = 300;

export default async function BetaFeedPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();

  // 카드 조회와 독립인 쿼리(ua·hotIds)는 먼저 띄워 병렬화.
  const hotIdsPromise = getHotQaIds(20);
  const uaPromise = headers().then((h) => h.get("user-agent") ?? "");

  let cards: CardData[] = [];
  let reportPool: ProcedureReport[] = [];
  const searchQuery = query || undefined;

  if (query) {
    // 검색어 로그(인기검색어 통계용) — fire-and-forget.
    if (query.length <= 100) {
      void supabase.from("search_logs").insert({ query, profile_id: viewer?.id ?? null }).then(() => { /* 실패해도 진행 */ });
    }
    const [listRes, pool] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: POOL }),
      getReviewSummaryFeedPool(supabase),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    reportPool = pool;
  } else {
    const [rpcRes, pool] = await Promise.all([
      supabase.rpc("feed_cards_scored", { p_limit: POOL, p_offset: 0, p_half_life_days: 14, p_jitter_amp: 0.35 }),
      getReviewSummaryFeedPool(supabase),
    ]);
    cards = diversifyByDoctor((rpcRes.data ?? []) as CardData[], { maxPerDoctorInHead: 1, headSize: 4 });
    reportPool = pool;
  }

  const [hotIdsArr, ua] = await Promise.all([hotIdsPromise, uaPromise]);
  const hotIds = Array.from(hotIdsArr);
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const viewerStates = await fetchViewerStatesRecord(supabase, viewer?.id ?? null, cards.map((c) => c.id));

  return (
    <div className="pb-16 sm:pb-0">
      <h1 className="sr-only">피부텐텐 베타 피드</h1>
      <BetaFeed
        key={query ? `q:${query}` : "feed"}
        initialPool={cards as unknown as CardDataList[]}
        pageSize={20}
        searchQuery={searchQuery}
        reportPool={reportPool}
        hotIds={hotIds}
        viewerStates={viewerStates}
        initialMobile={isMobileUA}
      />
    </div>
  );
}
