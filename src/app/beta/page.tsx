import type { Metadata } from "next";
import { headers } from "next/headers";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import BetaDiscovery from "@/components/beta/BetaDiscovery";
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

  // ── 리포트: 실제 ProcedureReportCard(통계형) 그대로 (검색 중엔 제외) ──
  if (cat === "review_summary" && !query) {
    const pool = await getReviewSummaryFeedPool(supabase);
    return (
      <div className="pb-16 sm:pb-0">
        <h1 className="sr-only">피부텐텐 베타 — 시술 리포트</h1>
        {pool.length === 0 ? (
          <div className="mx-auto max-w-[680px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">집계된 리포트가 없습니다.</div>
        ) : (
          <div className="mx-auto max-w-[680px] space-y-4">
            {pool.map((r) => (
              <ProcedureReportCard key={r.anchor?.id ?? r.en} report={r} feedHref={`/reports/${encodeURIComponent(r.procedureKo)}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 그 외: 실제 Feed ──
  const ua = (await headers()).get("user-agent") ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const { data: { user: viewer } } = await supabase.auth.getUser();

  let cards: CardData[] = [];
  let searchQuery: string | undefined;
  let reportPool: ProcedureReport[] = [];

  if (query) {
    // 검색어 로그(인기검색어 통계용) — /search 와 동일 패턴, fire-and-forget.
    if (query.length <= 100) {
      void supabase.from("search_logs").insert({ query, profile_id: viewer?.id ?? null }).then(() => { /* 실패해도 검색 진행 */ });
    }
    // 상단 검색창 입력 — 기존 검색 메커니즘(fetchCardList → search_cards_scored, 무한스크롤 동일).
    searchQuery = query;
    const { data } = await fetchCardList(supabase, { q: query, offset: 0, limit: PAGE });
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
      {/* 데스크탑: 피드 위 발견 영역 상시 노출(검색 결과일 땐 숨김) */}
      {!query && (
        <div className="mb-6 hidden rounded-[var(--radius)] bg-white p-5 sm:block">
          <BetaDiscovery />
        </div>
      )}
      {cards.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">표시할 글이 없습니다.</div>
      ) : (
        <Feed
          key={query ? `q:${query}` : cat || "all"}
          initial={cards}
          pageSize={PAGE}
          searchQuery={searchQuery}
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
