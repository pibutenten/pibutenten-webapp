import type { Metadata } from "next";
import { headers } from "next/headers";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool } from "@/lib/procedure-report";

/**
 * /beta 피드 — 홈과 동일한 실제 Feed/Card 그대로(데스크탑 2열 매스너리).
 * 레이아웃(1080 컨테이너·footer)은 기존 그대로. 내비만 BetaNav(5탭)로 교체(TopNav 분기).
 * noindex. 같은 호스트라 로그인 유지.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "피부텐텐 베타 (검토용)",
  robots: { index: false, follow: false },
};

const PAGE = 20;

export default async function BetaFeedPage() {
  const supabase = await createSupabaseServerClient();

  const ua = (await headers()).get("user-agent") ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);

  const rpcRes = await supabase.rpc("feed_cards_scored", {
    p_limit: PAGE, p_offset: 0, p_half_life_days: 14, p_jitter_amp: 0.35,
  });
  let cards = (rpcRes.data ?? []) as CardData[];
  cards = diversifyByDoctor(cards, { maxPerDoctorInHead: 1, headSize: 4 });

  const hotIds = Array.from(await getHotQaIds(20));
  const reportPool = await getReviewSummaryFeedPool(supabase);
  const { data: { user: viewer } } = await supabase.auth.getUser();
  const viewerStates = await fetchViewerStatesRecord(supabase, viewer?.id ?? null, cards.map((q) => q.id));

  return (
    <div className="pb-16 sm:pb-0">
      <h1 className="sr-only">피부텐텐 베타 피드</h1>
      {cards.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">등록된 글이 없습니다.</div>
      ) : (
        <Feed initial={cards} pageSize={PAGE} hotIds={hotIds} viewerStates={viewerStates} enableJustPublished reportPool={reportPool} initialMobile={isMobileUA} />
      )}
    </div>
  );
}
