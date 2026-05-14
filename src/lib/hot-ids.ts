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
  const { data, error } = await supabase.rpc("get_hot_card_ids", {
    p_limit: limit,
  });
  if (error || !data) return new Set();
  const ids = (data as unknown[])
    .map((row) => {
      if (typeof row === "number") return row;
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        const v = r.id ?? r.get_hot_card_ids ?? Object.values(r)[0];
        return typeof v === "number" ? v : Number(v);
      }
      return Number(row);
    })
    .filter((n): n is number => Number.isFinite(n));
  return new Set(ids);
});
