/**
 * admin-page-guard — RSC(서버 컴포넌트) 페이지용 admin 가드.
 *
 * ADR 0012 정합 (2026-05-26): 명함(profile) 단위 완전 독립.
 * 권한 매트릭스:
 *   - active.role='admin'                                  → isSuperAdmin=true (전체 admin 접근)
 *   - active.role='doctor' + doctor_accounts 매핑           → isDoctorAdmin=true (본인 doctor 화면 한정)
 *   - 둘 다 아님                                            → redirect (회원 차단)
 *
 * 옛 "묶음 OR" (auth_user_id 묶음 안 admin 1개라도 있으면 통과) 패턴 폐기.
 * 사용자 결정 (2026-05-26): 관리자 명함으로 active 가 아니면 못 들어가는 게 맞음.
 *
 * 분기 위치:
 *   - API/Server Action: `requireAdmin()` from admin-guard.ts
 *   - RSC 페이지       : `requireAdminPage()` (이 파일)
 */
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import type { ActiveIdentity } from "./identity-shared";
import { ROLES } from "./identity-shared";
import { resolveActiveIdentity } from "./identity-server";

export type { ActiveIdentity } from "./identity-shared";

export type AdminPageGuardResult = {
  user: { id: string; email: string | null };
  active: ActiveIdentity;
  /** active 가 admin role — 전체 admin 접근 허용 */
  isSuperAdmin: boolean;
  /** active 가 doctor + doctor_accounts 매핑 — 본인 doctor 한정 admin */
  isDoctorAdmin: boolean;
  /** active doctor_accounts.doctor_id (isDoctorAdmin 일 때만 의미) */
  activeDoctorId: string | null;
  /** active profile.id (ADR 0012 — 묶음 합산 폐기) */
  adminProfileId: string;
};

/**
 * admin 권한 검사 (active 단위) + active identity 컨텍스트 반환.
 * - 비로그인              → /login?next={next}
 * - super admin / doctor admin 둘 다 아님 → /login?error=관리자 권한이 필요합니다
 * - opts.superAdminOnly=true 인데 super admin 아님 → 차단 (doctor admin 도 거부)
 * - 통과                   → AdminPageGuardResult
 */
export async function requireAdminPage(
  next?: string,
  opts?: { superAdminOnly?: boolean },
): Promise<AdminPageGuardResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";
    redirect(`/login${nextParam}`);
  }

  // active identity 결정 — identity-server.resolveActiveIdentity 헬퍼 사용
  const active = await resolveActiveIdentity(supabase, user.id, user.email);
  if (!active) {
    redirect("/login?error=세션이 만료되었습니다");
  }

  // ADR 0012 정합 — active 단위 권한 판정
  const isSuperAdmin = active.role === ROLES.ADMIN;
  const isDoctorAdmin = !!active.doctorId;

  if (opts?.superAdminOnly) {
    if (!isSuperAdmin) {
      // active 가 doctor 면 본인 대시보드로
      if (active.role === ROLES.DOCTOR && active.doctorId) {
        redirect("/doctor");
      }
      redirect("/login?error=관리자 권한이 필요합니다");
    }
  } else if (!isSuperAdmin && !isDoctorAdmin) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    active,
    isSuperAdmin,
    isDoctorAdmin,
    activeDoctorId: active.doctorId,
    adminProfileId: active.profileId,
  };
}
