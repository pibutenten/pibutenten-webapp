import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CardData } from "@/lib/types/card";
import PostDetail from "./PostDetail";

/**
 * /beta-skin/post — 신규 스킨 "글 상세" 프리뷰 (post.html 컨셉).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터:
 *   - 글 본문: feed_cards_scored 의 실제 카드 1건(가능하면 Q&A 카드). 본문 전체 렌더.
 *   - 댓글: 샘플 2~3개(디자인만, 동작 X).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 글 상세",
  robots: { index: false, follow: false },
};

export default async function BetaSkinPostPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("feed_cards_scored", {
    p_limit: 5,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0.35,
  });

  const cards = (data ?? []) as CardData[];
  // 본문이 있는 Q&A(의사 글) 우선 → 없으면 본문 있는 첫 카드 → 없으면 첫 카드
  const card =
    cards.find(
      (c) => (c.category ?? c.type) === "qa" && c.body && c.body.length > 30,
    ) ??
    cards.find((c) => c.body && c.body.length > 0) ??
    cards[0] ??
    null;

  return <PostDetail card={card} />;
}
