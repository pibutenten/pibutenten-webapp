/**
 * admin-card-extras — admin EditClient 에 필요한 부가 데이터 fetch 헬퍼.
 * (2026-05-22)
 *
 * `/admin/cards/[id]/edit/page.tsx` 와 `/write/[shortcode]/page.tsx` 의 admin 분기에서
 * 공통으로 사용. 카드 자체는 호출 측에서 이미 fetch 한 상태로 들어옴.
 *
 * 반환:
 *   - doctors: 원장 목록 (정렬됨)
 *   - authorOptions: 글쓴이 변경용 옵션 — 글쓴이 role 따라 풀 제한
 *       - role='user'   → undefined (변경 불가, EditClient 가 readonly 박스만 렌더)
 *       - role='doctor' → 참여 전문의 풀
 *       - role='admin'  → 관리자 풀
 *       - role 없음(legacy) → admin + 참여 전문의 통합 풀 (호환)
 *   - doctorPickCount: 같은 doctor 의 현재 Pick 카드 수 (5개 제한 안내용)
 *   - commentCount: 카드의 visible 댓글 수
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

export type AuthorOption = {
  profileId: string;
  displayName: string | null;
  handle: string | null;
  role: string;
};

export type AdminCardExtras = {
  doctors: Doctor[];
  authorOptions: AuthorOption[] | undefined;
  doctorPickCount: number;
  commentCount: number;
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  handle: string | null;
  role: string;
};

export async function fetchAdminCardExtras(
  supabase: SupabaseClient,
  card: {
    id: number;
    doctor_id: string | null;
    author?: { role: string | null } | null;
  },
  opts: { isSuperAdmin: boolean },
): Promise<AdminCardExtras> {
  // 원장 목록 (doctor 변경 가능)
  const { data: doctorsRaw } = await supabase
    .from("doctors")
    .select("id, slug, name, branch")
    .order("sort_order", { ascending: true });
  const doctors = (doctorsRaw ?? []) as Doctor[];

  // 글쓴이 dropdown 옵션 — role 별 차등 필터 (super admin 만)
  let authorOptions: AuthorOption[] | undefined = undefined;
  if (opts.isSuperAdmin) {
    const authorRole = card.author?.role ?? null;

    // 일반회원 글은 글쓴이 변경 불가 — 옵션 미제공
    if (authorRole === "user") {
      authorOptions = undefined;
    } else if (authorRole === "doctor") {
      // 참여 전문의 풀만
      const { data: docProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, role")
        .in("handle", doctors.map((d) => d.slug));
      authorOptions = ((docProfiles ?? []) as ProfileLite[]).map((p) => ({
        profileId: p.id,
        displayName: p.display_name,
        handle: p.handle,
        role: p.role,
      }));
    } else if (authorRole === "admin") {
      // admin 풀만
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, role")
        .eq("role", "admin");
      authorOptions = ((adminProfiles ?? []) as ProfileLite[]).map((p) => ({
        profileId: p.id,
        displayName: p.display_name,
        handle: p.handle,
        role: p.role,
      }));
    } else {
      // author 없는 legacy 글 — admin + 의사 통합 풀 (안전 fallback)
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, role")
        .eq("role", "admin");
      const { data: docProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, role")
        .in("handle", doctors.map((d) => d.slug));
      authorOptions = [
        ...((adminProfiles ?? []) as ProfileLite[]).map((p) => ({
          profileId: p.id,
          displayName: p.display_name,
          handle: p.handle,
          role: p.role,
        })),
        ...((docProfiles ?? []) as ProfileLite[]).map((p) => ({
          profileId: p.id,
          displayName: p.display_name,
          handle: p.handle,
          role: p.role,
        })),
      ];
    }
  }

  // 같은 doctor 의 현재 Pick 개수 (5개 제한 표시)
  let doctorPickCount = 0;
  if (card.doctor_id) {
    const { count } = await supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", card.doctor_id)
      .eq("is_pick", true);
    doctorPickCount = count ?? 0;
  }

  // 댓글 수 (visible 만)
  let commentCount = 0;
  try {
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("card_id", card.id)
      .eq("status", "visible");
    commentCount = count ?? 0;
  } catch {
    commentCount = 0;
  }

  return { doctors, authorOptions, doctorPickCount, commentCount };
}
