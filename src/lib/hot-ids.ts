import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * HOT Q&A ID Set — 좋아요×2 + 조회수에 90일 반감기 가중, 상위 N개.
 * Supabase RPC `get_hot_card_ids` 사용.
 * React cache로 동일 요청 내 중복 호출 dedupe.
 *
 * 주의: Next.js의 unstable_cache 내부에서는 cookies()를 사용하는
 * server supabase client를 호출할 수 없으므로 사용하지 않음.
 */
export const getHotQaIds = cache(async (limit = 20): Promise<Set<number>> => {
  const supabase = await createSupabaseServerClient();
  // Sub-3 (2026-05-27): Supabase 명시 제네릭 `.returns<{ id: number }[]>()` 사용.
  // RPC `get_hot_card_ids` SETOF (id bigint) 반환 → row 별 `{ id: number }` 객체.
  // 옛 `as unknown[]` + 다단계 typeof 추측 매핑은 제네릭 도입으로 폐기.
  // Array.isArray 좁히기 — supabase-js 가 `.single()` chain 검증용으로 만드는
  // discriminator union (`T[] | { Error: ... }`) 중 array 분기를 좁혀냄.
  const { data, error } = await supabase
    .rpc("get_hot_card_ids", { p_limit: limit })
    .returns<{ id: number }[]>();
  if (error || !data || !Array.isArray(data)) return new Set();
  return new Set(data.map((row) => row.id).filter(Number.isFinite));
});
