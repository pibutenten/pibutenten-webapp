/**
 * 검색·피드 쿼리 SSOT 헬퍼 (배치 ⑤ H3, 2026-05-28).
 *
 * 같은 (q, category, doctor_slug, offset, limit) 조합으로 카드 목록을 가져오는 곳:
 *   1) `src/app/page.tsx` — 홈 피드 첫 페이지(검색 진입=AppShell 인-헤더 searchOpen → /?q=).
 *       구 `src/app/search/page.tsx` 폐기로 검색 첫 페이지도 홈으로 통합(2026-06-28).
 *   2) `src/app/api/cards/route.ts` — 무한스크롤 페이지네이션
 *   3) `src/app/doctors/[slug]/page.tsx` — 원장 페이지
 *
 * 옛 회귀: 검색 페이지 첫 페이지는 카테고리 라벨 (예: "피부일기") 일 때 `.eq("category", slug)`
 *   직접 필터, 무한스크롤(api/cards) 은 항상 `search_cards_scored` RPC → 21번째 카드부터
 *   다른 결과 집합으로 바뀌어 페이지네이션 깨짐.
 *
 * 본 헬퍼는 q 를 카테고리 라벨로 해석 (CATEGORY_LABEL_TO_SLUG) → 카테고리면 직접 필터, 아니면 RPC.
 * 3 호출처가 모두 본 헬퍼를 쓰면 동일한 쿼리 전략이 보장된다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { CATEGORY_LABEL_TO_SLUG } from "@/lib/post-category";

export type CardQueryInput = {
  q: string;
  /** 원장 페이지면 doctor.slug, 아니면 null. */
  doctorSlug?: string | null;
  /** 원장 페이지 칩 클릭으로 넘어왔을 때 가산 슬러그. */
  boostDoctorSlug?: string | null;
  /** 텍스트 검색과 동시에 거를 카테고리 슬러그(qa/review/doodle). 검색+탭 조합용. */
  category?: string | null;
  offset: number;
  limit: number;
};

/** q 가 카테고리 라벨이면 슬러그, 아니면 null. */
export function resolveCategorySlug(q: string): string | null {
  if (!q) return null;
  return CATEGORY_LABEL_TO_SLUG[q] ?? null;
}

/**
 * 카드 목록 fetch — 카테고리 라벨이면 직접 필터, 아니면 search_cards_scored RPC.
 *
 * 반환은 `{ data, error }` 로 supabase 클라이언트와 동일 형식. 호출자는 `data ?? []` 로 사용.
 */
export async function fetchCardList(
  supabase: SupabaseClient,
  input: CardQueryInput,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const { q, doctorSlug, boostDoctorSlug, category, offset, limit } = input;
  const categorySlug = resolveCategorySlug(q);

  // 카테고리 라벨 검색 — q 를 본문 매칭 대신 category 컬럼만.
  // doctor_slug 와 동시 사용 케이스는 현재 없으나 향후 확장 대비 doctor_id 매칭도 함께.
  // 정렬: 표시일 = reviewed_at ?? created_at 과 일치하도록 reviewed_at 우선
  //   (qa 는 검수일 = reviewed_at, doodle 은 reviewed_at NULL → created_at 으로 자연 정렬).
  if (categorySlug) {
    let qb = supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("status", "published")
      .eq("category", categorySlug)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    // doctor_slug 가 지정되면 doctor.id 조인 후 필터 — 현재 호출 케이스에 없지만 확장 대비.
    if (doctorSlug) {
      const { data: doctor } = await supabase
        .from("doctors")
        .select("id")
        .eq("slug", doctorSlug)
        .maybeSingle();
      if (!doctor) return { data: [], error: null };
      qb = qb.eq("doctor_id", (doctor as { id: string }).id);
    }
    const res = await qb;
    return { data: res.data, error: res.error };
  }

  // 일반 텍스트 검색 또는 빈 q (홈/원장 페이지의 default 정렬).
  // category 가 지정되면(검색+탭 조합) 해당 카테고리만 — p_category 로 전달.
  const res = await supabase.rpc("search_cards_scored", {
    p_q: q,
    p_doctor_slug: doctorSlug ?? null,
    p_offset: offset,
    p_limit: limit,
    p_boost_doctor_slug: boostDoctorSlug ?? null,
    p_category: category ?? null,
  });
  return { data: res.data, error: res.error };
}
