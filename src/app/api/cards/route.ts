import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/error-response";
import { fetchCardList } from "@/lib/search-query";
import { CARD_LIST_SELECT } from "@/lib/card-select";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

/**
 * GET /api/cards?offset=0&limit=20&q=쥬브젠
 *   - 배치 ⑤ H3 (2026-05-28): fetchCardList SSOT 헬퍼로 통일.
 *   - q 가 카테고리 라벨 ("피부일기" 등) → .eq("category", slug) 직접 필터.
 *     아니면 search_cards_scored RPC.
 *   - 검색 페이지 첫 페이지와 동일 헬퍼 → 무한스크롤 결과 집합 일관성 보장.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));
  const q = (url.searchParams.get("q") ?? "").trim();
  const doctorSlug = (url.searchParams.get("doctor_slug") ?? "").trim();
  const boostDoctorSlug = (url.searchParams.get("boost") ?? "").trim();
  const category = (url.searchParams.get("cat") ?? "").trim(); // 검색+카테고리 조합(검색) — 무한스크롤 동일 필터 유지.

  const supabase = await createSupabaseServerClient();

  // "방금 쓴 글" 1회 노출용 단일 ID fetch.
  //   ?ids=1,2,3 → cards.in("id", [...]) 직접 조회. status='published' + deleted_at IS NULL 강제.
  //   Feed(enableJustPublished) 가 sessionStorage 의 id 로 호출.
  //   deleted_at 필터: 발행 직후 soft-delete 된 글이 prepend 되는 것 방지 (feed_cards_scored 와 동일 불변식).
  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 60); // 안전 상한(무한스크롤 한 묶음 ≤ pageSize=20, 여유 포함)
    if (ids.length === 0) {
      return NextResponse.json({ cards: [] }, { headers: { "cache-control": "no-store" } });
    }
    const r = await supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .in("id", ids)
      .eq("status", "published")
      .is("deleted_at", null);
    if (r.error) {
      return errorResponse(r.error, "generic", "[cards GET ids]", 500);
    }
    return NextResponse.json(
      { cards: r.data ?? [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data, error } = await fetchCardList(supabase, {
    q,
    doctorSlug: doctorSlug || null,
    boostDoctorSlug: boostDoctorSlug || null,
    category: category || null,
    offset,
    limit,
  });

  if (error) {
    return errorResponse(error, "generic", "[cards GET] fetchCardList", 500);
  }

  return NextResponse.json(
    { cards: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}

