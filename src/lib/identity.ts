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
 *
 * Phase 2 정리 (2026-05-16): cookie 읽기 + profile/doctor_accounts lookup 본문 50줄을
 * identity-server.ts 의 resolveActiveIdentity 헬퍼로 추출. admin-page-guard.ts 도 동일 헬퍼 사용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ActiveIdentity } from "./identity-shared";
import { resolveActiveIdentity } from "./identity-server";

export type { ActiveIdentity } from "./identity-shared";

export type IdentityContext = {
  user: { id: string; email: string | null };
  active: ActiveIdentity | null;
  isSuperAdmin: boolean;
  isDoctorAdmin: boolean;
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

  const active = await resolveActiveIdentity(supabase, user.id, user.email);
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
