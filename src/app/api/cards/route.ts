import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

/**
 * GET /api/cards?offset=0&limit=20&q=쥬브젠
 *   - 발행된 Q&A를 created_at desc, id desc 정렬 (안정적)
 *   - q 있으면 question/answer ILIKE 부분일치 필터
 *   - doctor / video JOIN 결과 함께 반환
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));
  const q = (url.searchParams.get("q") ?? "").trim();
  const doctorSlug = (url.searchParams.get("doctor_slug") ?? "").trim();
  const boostDoctorSlug = (url.searchParams.get("boost") ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // 항상 search_cards_scored RPC 사용
  const res = await supabase.rpc("search_cards_scored", {
    p_q: q,
    p_doctor_slug: doctorSlug || null,
    p_offset: offset,
    p_limit: limit,
    p_boost_doctor_slug: boostDoctorSlug || null,
  });
  const data = res.data as unknown[] | null;
  const error = res.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { cards: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}

