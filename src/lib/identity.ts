/**
 * Active identity 권한 분기 헬퍼 (server-side).
 *
 * Phase 9: profile_identities 폐기. 모든 ID는 독립 profiles row.
 *
 * cookie 'pibutenten:identity' 값:
 *   - 'primary' 또는 없음 → 본인 auth user의 profiles row (id = auth.uid())
 *   - UUID → 같은 auth_user_id 묶음 멤버 중 그 profiles.id 사용
 *
 * 권한 모델:
 *   active.role='admin'         → super admin (모든 권한)
 *   active.role='doctor' + doctor_accounts 매핑 → 원장 admin (본인 doctor 카드만)
 *   active.role='user'          → 일반 사용자 (admin 페이지 차단)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const COOKIE = "pibutenten:identity";

export type ActiveIdentity = {
  /** active profiles.id ('primary' = 본인 auth user의 row) */
  id: string | "primary";
  /** 묶음 키 (auth.users.id) */
  authUserId: string;
  /** 현재 active profile.id (실제 UUID — DB 행위 user_id로 사용) */
  profileId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 'admin' | 'doctor' | 'user' */
  role: string;
  /**
   * @deprecated Phase 9: kind는 role과 동일. 호환성 위해 유지.
   */
  kind: string;
  /** doctor_accounts 매핑된 doctor_id (없으면 NULL) */
  doctorId: string | null;
};

export type IdentityContext = {
  user: { id: string; email: string | null };
  active: ActiveIdentity | null;
  isSuperAdmin: boolean;
  isDoctorAdmin: boolean;
  activeDoctorId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // active profile.id 결정
  // - 'primary' → 본인 auth user의 profile (id = user.id)
  // - UUID → 그 profiles.id (단, 같은 auth_user_id 묶음 멤버여야 함)
  let targetProfileId = user.id;
  if (cookieVal !== "primary" && UUID_RE.test(cookieVal)) {
    targetProfileId = cookieVal;
  }

  // profiles에서 조회 + 본인 묶음(auth_user_id = user.id) 검증
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, role, auth_user_id")
    .eq("id", targetProfileId)
    .maybeSingle();

  // 본인 묶음 멤버 검증 — 다른 사람 profiles로 스위치 시도 차단
  let active: ActiveIdentity | null = null;
  if (profile && (profile.auth_user_id === user.id || targetProfileId === user.id)) {
    // doctor_accounts 매핑 lookup
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id")
      .eq("profile_id", targetProfileId)
      .maybeSingle();
    const doctorId = (da?.doctor_id as string | null) ?? null;
    const role = (profile.role as string) ?? "user";
    active = {
      id: targetProfileId === user.id ? "primary" : targetProfileId,
      authUserId: user.id,
      profileId: targetProfileId,
      handle: (profile.handle as string) ?? "",
      displayName: (profile.display_name as string) ?? user.email ?? "",
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      role,
      kind: role, // 호환성 alias
      doctorId,
    };
  }

  const isSuperAdmin = active?.role === "admin";
  const isDoctorAdmin = !!active?.doctorId;

  return {
    user: { id: user.id, email: user.email ?? null },
    active,
    isSuperAdmin,
    isDoctorAdmin,
    activeDoctorId: active?.doctorId ?? null,
  };
}
