import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { isPostCategorySlug, labelForCategory } from "@/lib/post-category";

/**
 * /beta 피드 — 홈과 동일한 실제 Feed/Card 그대로(데스크탑 2열) + 상단 카테고리 선택.
 * 카테고리 필터는 기존 메커니즘(fetchCardList q=라벨 → category 필터, /api/cards 무한스크롤 동일) 재사용.
 * 레이아웃·카드·폭은 기존 그대로. 내비만 BetaNav(5탭). noindex.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "피부텐텐 베타 (검토용)",
  robots: { index: false, follow: false },
};

const PAGE = 20;

// 피드 상단 카테고리 — 표시 라벨 / cards.category slug 매핑.
const CATS: { label: string; cat: string }[] = [
  { label: "전체", cat: "" },
  { label: "Q&A", cat: "qa" },
  { label: "시술후기", cat: "review" },
  { label: "커뮤니티", cat: "doodle" },
  { label: "리포트", cat: "review_summary" },
];
const PRIMARY = "#4cbff2";

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

export default async function BetaFeedPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const sp = await searchParams;
  const cat = sp.cat ?? "";
  const supabase = await createSupabaseServerClient();

  const ua = (await headers()).get("user-agent") ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const { data: { user: viewer } } = await supabase.auth.getUser();

  let cards: CardData[] = [];
  let searchQuery: string | undefined;
  let reportPool: ProcedureReport[] = [];

  if (isPostCategorySlug(cat)) {
    // 카테고리 선택 — 기존 fetchCardList(q=라벨)로 category 필터 (무한스크롤도 동일 q 로 정합).
    const label = labelForCategory(cat);
    searchQuery = label;
    const { data } = await fetchCardList(supabase, { q: label, offset: 0, limit: PAGE });
    cards = (data ?? []) as unknown as CardData[];
  } else {
    // 전체 — 홈과 동일한 스코어드 피드 + 리포트 주입.
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
