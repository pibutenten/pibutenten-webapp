/**
 * 카드 피드용 viewer state batch fetch.
 * 서버에서 viewer의 좋아요/저장/평점 상태를 한 번에 fetch해서
 * QACard에 props로 넘기면 클라이언트 useEffect 추가 fetch가 사라져
 * 카드 첫 렌더가 즉시 정확한 상태로 표시됨.
 *
 * Phase 9: viewerId는 active profile.id로 자동 변환됨.
 * - cookie 'pibutenten:identity'가 UUID면 그 값(active profile.id) 사용
 * - 없거나 'primary'면 authUserId (= primary profile.id)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type ViewerStateMap = Map<
  number,
  { liked?: boolean; saved?: boolean; rating?: number }
>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** active identity cookie → 활성 profile.id. 없거나 primary면 authUserId 그대로. */
async function resolveActiveProfileId(authUserId: string): Promise<string> {
  try {
    const c = await cookies();
    const val = c.get("pibutenten:identity")?.value;
    if (val && val !== "primary" && UUID_RE.test(val)) return val;
  } catch {
    /* cookies() 컨텍스트 밖이면 fallback */
  }
  return authUserId;
}

/**
 * 주어진 qaIds 목록에 대해 viewer의 좋아요/저장/평점을 일괄 조회.
 * viewerId가 null이면 빈 Map 반환 (미로그인).
 * Phase 9: viewerId는 active profile.id로 자동 변환 (cookie 기반).
 */
export async function fetchViewerStates(
  supabase: SupabaseClient,
  viewerId: string | null,
  qaIds: number[],
): Promise<ViewerStateMap> {
  const map: ViewerStateMap = new Map();
  if (!viewerId || qaIds.length === 0) return map;
  const activeId = await resolveActiveProfileId(viewerId);
  const [likes, saves, ratings] = await Promise.all([
    supabase
      .from("card_likes")
      .select("card_id")
      .eq("user_id", activeId)
      .in("card_id", qaIds),
    supabase
      .from("card_saves")
      .select("card_id")
      .eq("user_id", activeId)
      .in("card_id", qaIds),
    supabase
      .from("card_ratings")
      .select("card_id, rating")
      .eq("user_id", activeId)
      .in("card_id", qaIds),
  ]);
  for (const r of likes.data ?? []) {
    const id = (r as { card_id: number }).card_id;
    const cur = map.get(id) ?? {};
    cur.liked = true;
    map.set(id, cur);
  }
  for (const r of saves.data ?? []) {
    const id = (r as { card_id: number }).card_id;
    const cur = map.get(id) ?? {};
    cur.saved = true;
    map.set(id, cur);
  }
  for (const r of ratings.data ?? []) {
    const row = r as { card_id: number; rating: number };
    const cur = map.get(row.card_id) ?? {};
    cur.rating = row.rating;
    map.set(row.card_id, cur);
  }
  return map;
}
