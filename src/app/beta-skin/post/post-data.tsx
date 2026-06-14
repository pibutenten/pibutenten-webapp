import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import type { CardData } from "@/lib/types/card";
import PostDetail from "./PostDetail";

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * 베타 글상세 공용 데이터 빌더 — ?id= 라우트와 canonical([...slug]) 라우트가 공유.
 *   - related("함께 보면 좋은 Q&A"): 같은 영상(video_id) 우선 + 키워드 겹침 순 상위 3개(연관 0 채우기 없음).
 *   - viewer: 좋아요/저장 초기상태 prefetch.
 *   - doctorIntro: 사이드 프로필 아코디언 펼침 내용(운영 doctors.intro).
 */
export async function renderBetaPost(
  supabase: Supa,
  card: CardData | null,
  idCardVideoId: number | null,
) {
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
  for (const c of (sameVideoRes.data ?? []) as unknown as CardData[]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      related.push(c);
    }
  }
  ((keywordRes.data ?? []) as unknown as CardData[])
    .filter((c) => !seen.has(c.id))
    .map((c) => ({ c, n: (c.keywords ?? []).filter((k) => kwSet.has(k)).length }))
    .sort((a, b) => b.n - a.n)
    .forEach(({ c }) => {
      seen.add(c.id);
      related.push(c);
    });
  const related3 = related.slice(0, 3);

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
