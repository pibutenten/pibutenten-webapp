import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/lib/types/card";
import { renderBetaPost } from "./post-data";

/**
 * /beta-skin/post — 신규 스킨 "글 상세" 프리뷰 (post.html 컨셉).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터:
 *   - ?id= 가 있으면 cards 테이블에서 그 카드를 직접 조회(운영 /api/cards ids 분기와 동일 select).
 *     feed_cards_scored 24장 밖(검색결과·25번째 이후)에서 진입해도 정확히 표시.
 *   - id 직접 조회 결과가 없거나 id 미지정이면 폴백(Q&A 우선 → 본문 있는 첫 카드 → 첫 카드).
 *   - related("함께 보면 좋은 Q&A"): 같은 영상(video_id 일치) 우선 + 키워드 겹침(.overlaps) 순으로 상위 3개.
 *     연관도 0(무관) 채우기는 하지 않음 — 없으면 PostDetail 이 섹션을 숨김.
 *   - id 직접조회와 feed 폴백 조회는 Promise.all 로 병렬.
 *   - 댓글: 실제 카드일 때만 운영 CommentsBlock 렌더(PostDetail 내부).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 글 상세",
  robots: { index: false, follow: false },
};

export default async function BetaSkinPostPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const numericId = id ? Number(id) : NaN;

  // id 직접 조회(있을 때만) + 폴백용 feed 풀(feed_cards_scored 24)을 병렬로.
  //   같은 영상 추천을 위해 byId select 에 video_id 만 추가(표시는 video:videos 조인이 담당).
  const [byIdRes, feedRes] = await Promise.all([
    Number.isFinite(numericId)
      ? supabase
          .from("cards")
          .select(`${CARD_LIST_SELECT}, video_id`)
          .eq("id", numericId)
          .eq("status", "published")
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("feed_cards_scored", {
      p_limit: 24,
      p_offset: 0,
      p_half_life_days: 14,
      p_jitter_amp: 0.35,
    }),
  ]);

  const idCard = (byIdRes.data ?? null) as unknown as CardData | null;
  // 같은 영상 추천용 video_id — byId 진입(?id=)일 때만 확보(폴백 카드는 null → 같은 영상 추천 생략).
  const idCardVideoId =
    (byIdRes.data as { video_id?: number | null } | null)?.video_id ?? null;
  const cards = (feedRes.data ?? []) as CardData[];

  // id 직접 조회 카드 우선 → 없으면 본문 있는 Q&A → 본문 있는 첫 카드 → 첫 카드.
  const card =
    idCard ??
    cards.find(
      (c) => (c.category ?? c.type) === "qa" && c.body && c.body.length > 30,
    ) ??
    cards.find((c) => c.body && c.body.length > 0) ??
    cards[0] ??
    null;

  // 연관 Q&A·viewer·원장 소개는 canonical 라우트와 공용(renderBetaPost).
  return renderBetaPost(supabase, card, idCardVideoId);
}
