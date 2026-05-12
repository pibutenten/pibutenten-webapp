/**
 * Active identity 권한 분기 헬퍼 (server-side).
 *
 * 기존 cookie 시스템 사용:
 *   cookie 'pibutenten:identity' = 'primary' (= profiles row 자체) 또는 profile_identities.id (UUID)
 *
 * 권한 모델:
 *   active.kind='admin'           → super admin (개발자/관리자, 모든 권한)
 *   active.doctor_id NOT NULL     → 원장 admin (본인 doctor 카드만)
 *   active.kind='personal'        → 일반 사용자 (admin 페이지 차단)
 *
 * Note: profile.role='admin' 사용자라도 active identity가 'personal'이면
 *       일반 사용자처럼 동작 (관리자 진입 X).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const COOKIE = "pibutenten:identity";

export type ActiveIdentity = {
  /** primary identity면 'primary'. 그 외엔 profile_identities.id */
  id: string | "primary";
  profileId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: string;
  doctorId: string | null;
};

export type IdentityContext = {
  user: { id: string; email: string | null };
  /** active identity (cookie 기반). 미설정 시 primary identity로 fallback. */
  active: ActiveIdentity | null;
  /** active identity가 super admin (개발자/관리자) 인지 */
  isSuperAdmin: boolean;
  /** active identity가 원장 admin (doctor_id 매핑) 인지 */
  isDoctorAdmin: boolean;
  /** 원장 admin일 때 현재 doctor_id (그 외 NULL) */
  activeDoctorId: string | null;
};

/**
 * 현재 로그인된 user의 active identity 조회 + 권한 분기 flag.
 * 로그인 안 됐으면 null.
 */
export async function getIdentityContext(
  supabase: SupabaseClient,
): Promise<IdentityContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(COOKIE)?.value ?? "primary";

  let active: ActiveIdentity | null = null;

  if (cookieVal === "primary") {
    // primary identity = profiles row 자체 + doctor_accounts 매핑 lookup
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) {
      const { data: da } = await supabase
        .from("doctor_accounts")
        .select("doctor_id")
        .eq("profile_id", user.id)
        .maybeSingle();
      const doctorId = (da?.doctor_id as string | null) ?? null;
      active = {
        id: "primary",
        profileId: user.id,
        handle: (profile.handle as string) ?? "",
        displayName: (profile.display_name as string) ?? user.email ?? "",
        avatarUrl: (profile.avatar_url as string | null) ?? null,
        kind: doctorId
          ? "doctor"
          : profile.role === "admin"
            ? "admin"
            : profile.role === "doctor"
              ? "doctor"
              : "personal",
        doctorId,
      };
    }
  } else if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(cookieVal)) {
    // UUID → profile_identities row
    const { data: row } = await supabase
      .from("profile_identities")
      .select(
        "id, profile_id, handle, display_name, avatar_url, kind, doctor_id",
      )
      .eq("id", cookieVal)
      .eq("profile_id", user.id) // 본인 소유 검증
      .maybeSingle();
    if (row) {
      active = {
        id: row.id as string,
        profileId: row.profile_id as string,
        handle: row.handle as string,
        displayName: row.display_name as string,
        avatarUrl: (row.avatar_url as string | null) ?? null,
        kind: row.kind as string,
        doctorId: (row.doctor_id as string | null) ?? null,
      };
    }
  }

  const isSuperAdmin = active?.kind === "admin";
  const isDoctorAdmin = !!active?.doctorId;

  return {
    user: { id: user.id, email: user.email ?? null },
    active,
    isSuperAdmin,
    isDoctorAdmin,
    activeDoctorId: active?.doctorId ?? null,
  };
}
