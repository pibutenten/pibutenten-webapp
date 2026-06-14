import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import type { CardData } from "@/lib/types/card";
import PostDetail from "./PostDetail";

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

  // 함께 보면 좋은 Q&A — (1) 같은 유튜브 영상에서 나온 Q&A, (2) 키워드가 겹치는 Q&A.
  //   기존엔 feed 24장 풀에서 뽑아 연관도 0(무관)까지 그대로 노출됐다(힐로웨이브 글에 쥬브젠 Q&A 등).
  //   → 전용 쿼리로 교체: 같은 영상(video_id 직접 일치) 우선 → 키워드 겹침 많은 순. 연관 0 채우기 없음.
  //   video_id 컬럼으로 직접 필터(임베드 관계 필터 불확실성 회피).
  const cardKeywords = card?.keywords ?? [];
  const [sameVideoRes, keywordRes] = await Promise.all([
    idCardVideoId != null && card
      ? supabase
          .from("cards")
          .select(CARD_LIST_SELECT)
          .eq("video_id", idCardVideoId)
          .eq("status", "published")
          .is("deleted_at", null)
          .or("category.eq.qa,type.eq.qa")
          .neq("id", card.id)
          .limit(6)
      : Promise.resolve({ data: [] as unknown[] }),
    cardKeywords.length && card
      ? supabase
          .from("cards")
          .select(CARD_LIST_SELECT)
          .overlaps("keywords", cardKeywords)
          .eq("status", "published")
          .is("deleted_at", null)
          .or("category.eq.qa,type.eq.qa")
          .neq("id", card.id)
          .limit(20)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const kwSet = new Set(cardKeywords);
  const seen = new Set<number>([card?.id ?? -1]);
  const related: CardData[] = [];
  // 같은 영상 Q&A 먼저(가장 직접적인 연관).
  for (const c of (sameVideoRes.data ?? []) as unknown as CardData[]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      related.push(c);
    }
  }
  // 그다음 키워드 겹침 많은 순.
  ((keywordRes.data ?? []) as unknown as CardData[])
    .filter((c) => !seen.has(c.id))
    .map((c) => ({ c, n: (c.keywords ?? []).filter((k) => kwSet.has(k)).length }))
    .sort((a, b) => b.n - a.n)
    .forEach(({ c }) => {
      seen.add(c.id);
      related.push(c);
    });
  const related3 = related.slice(0, 3);

  // 현재 카드의 viewer 좋아요/저장 초기상태 prefetch(피드 카드와 동일 패턴).
  // 실제 카드일 때만 조회. 샘플(card=null)이면 viewer 생략.
  let viewer: { liked?: boolean; saved?: boolean } | undefined;
  if (card) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const viewerStates = await fetchViewerStatesRecord(
      supabase,
      user?.id ?? null,
      [card.id],
    );
    viewer = viewerStates[card.id];
  }

  // 작성자(원장) 소개 — 사이드 프로필 카드 펼침 내용(운영 doctors.intro 재사용). 회원 글이면 없음.
  let doctorIntro: string | null = null;
  if (card?.doctor?.slug) {
    const { data: dp } = await supabase
      .from("doctors")
      .select("intro")
      .eq("slug", card.doctor.slug)
      .maybeSingle()
      .returns<{ intro: string | null } | null>();
    doctorIntro = dp?.intro ?? null;
  }

  return (
    <PostDetail
      card={card}
      related={related3}
      viewer={viewer}
      doctorIntro={doctorIntro}
    />
  );
}
