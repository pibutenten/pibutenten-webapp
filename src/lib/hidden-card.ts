/**
 * Hidden 카드 placeholder 헬퍼 — DRY 추출 (P2-5, 2026-05-29).
 *
 * 배치 ④ (2026-05-28) 의 hidden 카드 단일 URL 직접 접근 시 placeholder + noindex 정책.
 * 회원 글 라우트 (`/{handle}/{shortcode}`) 와 의사 글 라우트 (`/doctors/{slug}/{year}/{post-slug}`)
 * 가 같은 로직을 독립 구현하던 것을 통합.
 *
 * fetchQa / fetch* 가 null 일 때 admin client (RLS 우회) 로 status 만 확인:
 *   - status='hidden' + deleted_at IS NULL → placeholder (interstitial)
 *   - 그 외 (없거나 deleted_at 존재) → 진짜 404
 *
 * RLS 우회는 의도된 동작 — viewer 권한과 무관하게 "비공개" 안내를 보여주기 위함.
 */
import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** 회원 글 라우트용: shortcode + author handle 매칭. */
export async function checkHiddenByShortcode(
  handle: string,
  shortcode: string,
): Promise<boolean> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) return false;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("cards")
      .select("status, deleted_at, author:profiles!author_id(handle)")
      .eq("shortcode", shortcode)
      .maybeSingle();
    if (!data) return false;
    const meta = data as {
      status: string;
      deleted_at: string | null;
      author: { handle: string | null } | { handle: string | null }[] | null;
    };
    if (meta.deleted_at) return false;
    if (meta.status !== "hidden") return false;
    const a = Array.isArray(meta.author) ? meta.author[0] : meta.author;
    return !!a && a.handle === handle;
  } catch {
    return false;
  }
}

/** 의사 글 라우트용: doctor.slug + post_year + post_slug 매칭. cache() 로 같은 요청 내 중복 호출 dedup. */
export const checkHiddenByDoctorPost = cache(
  async (
    doctorSlug: string,
    year: number,
    postSlug: string,
  ): Promise<boolean> => {
    try {
      const admin = createSupabaseAdminClient();
      const { data: doctor } = await admin
        .from("doctors")
        .select("id")
        .eq("slug", doctorSlug)
        .maybeSingle();
      if (!doctor) return false;
      const { data } = await admin
        .from("cards")
        .select("status, deleted_at, category")
        .eq("doctor_id", (doctor as { id: string }).id)
        .eq("post_year", year)
        .eq("post_slug", postSlug)
        .maybeSingle();
      if (!data) return false;
      const meta = data as {
        status: string;
        deleted_at: string | null;
        category: string;
      };
      return (
        meta.status === "hidden" &&
        meta.deleted_at === null &&
        meta.category === "qa"
      );
    } catch {
      return false;
    }
  },
);
