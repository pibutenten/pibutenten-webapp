import type { Metadata } from "next";
import Link from "next/link";
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
const PRIMARY = "#4cbff2";

const CATS: { label: string; cat: string }[] = [
  { label: "전체", cat: "" },
  { label: "Q&A", cat: "qa" },
  { label: "시술후기", cat: "review" },
  { label: "끄적끄적", cat: "doodle" },
  { label: "리포트", cat: "review_summary" },
];

function CategoryBar({ active }: { active: string }) {
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {CATS.map((c) => {
        const on = active === c.cat;
        return (
          <Link
            key={c.cat || "all"}
            href={c.cat ? `/beta?cat=${c.cat}` : "/beta"}
            scroll={false}
            className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all"
            style={on ? { background: PRIMARY, color: "#fff", borderColor: PRIMARY } : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}

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
        <CategoryBar active={cat} />
        {pool.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">집계된 리포트가 없습니다.</div>
        ) : (
          <div className="sm:columns-2 sm:[column-gap:1rem]">
            {pool.map((r) => (
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
  const { data: { user: viewer } } = await supabase.auth.getUser();

  let cards: CardData[] = [];
  let searchQuery: string | undefined;
  let reportPool: ProcedureReport[] = [];

  if (query) {
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
      <CategoryBar active={cat} />
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
