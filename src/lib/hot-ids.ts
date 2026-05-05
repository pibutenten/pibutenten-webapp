import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * HOT Q&A ID Set — 좋아요×2 + 조회수에 90일 반감기 가중, 상위 N개.
 * Supabase RPC `get_hot_qa_ids` 사용. 1분 캐시 (좋아요·조회수 변화 적당히 반영).
 */
export const getHotQaIds = unstable_cache(
  async (limit = 20): Promise<Set<number>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_hot_qa_ids", {
      p_limit: limit,
    });
    if (error || !data) return new Set();
    // RPC가 setof bigint를 반환 — { id?: number, get_hot_qa_ids?: number } 또는 raw number
    const ids = (data as unknown[])
      .map((row) => {
        if (typeof row === "number") return row;
        if (row && typeof row === "object") {
          const r = row as Record<string, unknown>;
          const v = r.id ?? r.get_hot_qa_ids ?? Object.values(r)[0];
          return typeof v === "number" ? v : Number(v);
        }
        return Number(row);
      })
      .filter((n): n is number => Number.isFinite(n));
    return new Set(ids);
  },
  ["hot-qa-ids"],
  { revalidate: 60, tags: ["hot-qa"] },
);
