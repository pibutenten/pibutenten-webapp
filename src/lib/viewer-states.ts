/**
 * 카드 피드용 viewer state batch fetch.
 * 서버에서 viewer의 좋아요/저장 상태를 한 번에 fetch해서
 * Card에 props로 넘기면 클라이언트 useEffect 추가 fetch가 사라져
 * 카드 첫 렌더가 즉시 정확한 상태로 표시됨.
 *
 * Phase 9: viewerId는 active profile.id로 자동 변환됨.
 * - cookie 'pibutenten:identity'가 UUID면 그 값(active profile.id) 사용
 * - 없거나 'primary'면 authUserId (= primary profile.id)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  IDENTITY_COOKIE,
  PRIMARY_IDENTITY_ID,
  UUID_RE,
} from "@/lib/identity-shared";

export type ViewerStateMap = Map<
  number,
  { liked?: boolean; saved?: boolean }
>;

/** active identity cookie → 활성 profile.id. 없거나 primary면 authUserId 그대로. */
async function resolveActiveProfileId(authUserId: string): Promise<string> {
  try {
    const c = await cookies();
    const val = c.get(IDENTITY_COOKIE)?.value;
    if (val && val !== PRIMARY_IDENTITY_ID && UUID_RE.test(val)) return val;
  } catch {
    /* cookies() 컨텍스트 밖이면 fallback */
  }
  return authUserId;
}

/**
 * 주어진 cardIds 목록에 대해 viewer의 좋아요/저장을 일괄 조회.
 * viewerId가 null이면 빈 Map 반환 (미로그인).
 * Phase 9: viewerId는 active profile.id로 자동 변환 (cookie 기반).
 */
export async function fetchViewerStates(
  supabase: SupabaseClient,
  viewerId: string | null,
  cardIds: number[],
): Promise<ViewerStateMap> {
  const map: ViewerStateMap = new Map();
  if (!viewerId || cardIds.length === 0) return map;
  const activeId = await resolveActiveProfileId(viewerId);
  const [likes, saves] = await Promise.all([
    supabase
      .from("card_likes")
      .select("card_id")
      .eq("user_id", activeId)
      .in("card_id", cardIds),
    supabase
      .from("card_saves")
      .select("card_id")
      .eq("user_id", activeId)
      .in("card_id", cardIds),
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
  return map;
}

/**
 * `fetchViewerStates` 의 Record 반환 버전.
 * 호출처들이 `Map → Record<number, …>` 로 직접 변환하던 4곳의 중복 패턴 제거용.
 * (page.tsx / search/page.tsx / [handle]/page.tsx / doctors/[slug]/page.tsx)
 *
 * 내부적으로 fetchViewerStates 를 그대로 호출해 Map → Record 변환만 수행.
 * 기존 Map 시그니처는 다른 호출처 호환 위해 유지.
 */
export async function fetchViewerStatesRecord(
  supabase: SupabaseClient,
  viewerId: string | null,
  cardIds: number[],
): Promise<Record<number, { liked?: boolean; saved?: boolean }>> {
  const map = await fetchViewerStates(supabase, viewerId, cardIds);
  const rec: Record<number, { liked?: boolean; saved?: boolean }> = {};
  for (const [id, st] of map) rec[id] = st;
  return rec;
}
