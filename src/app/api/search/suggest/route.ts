import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";

/**
 * 검색 발견 데이터 — 인기검색어(7일 top10) + 카테고리별 칩.
 * 전부 기존 소스 재사용:
 *   - 인기검색어: 관리자와 동일 RPC get_top_search_queries(7일, 10개)
 *   - 카테고리 칩: getPopularByCategory (카드 태그 빈도, /search 와 동일)
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const [popRes, cats] = await Promise.all([
    supabase.rpc("get_top_search_queries", { p_days: 7, p_limit: 10 }),
    getPopularByCategory(),
  ]);
  const popular = ((popRes.data ?? []) as { query: string; cnt: number }[])
    .map((r) => r.query)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  return NextResponse.json({ popular, cats });
}
