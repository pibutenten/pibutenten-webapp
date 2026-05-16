/**
 * admin-page-guard — RSC(서버 컴포넌트) 페이지용 admin 가드.
 *
 * Phase 9 정책 (PRD §C): admin 권한 = **묶음(auth_user_id) 단위**.
 * 같은 사람의 profile 묶음 안에 role='admin' profile이 1개 이상 있으면 super admin 인정.
 *
 * 권한 매트릭스:
 *   - 묶음에 admin role profile 있음     → isSuperAdmin=true (활성 명함 무관, 전체 admin 접근)
 *   - active profile이 doctor + doctor_accounts 매핑 → isDoctorAdmin=true (본인 doctor 화면 한정)
 *   - 둘 다 아님                         → redirect (일반 회원 차단)
 *
 * 분기 위치:
 *   - API/Server Action: `requireAdmin()` from admin-guard.ts
 *   - RSC 페이지       : `requireAdminPage()` (이 파일)
 *
 * 활성 명함이 회원이어도 묶음에 admin 있으면 통과 — 운영자가 점검·작성 동선에서
 * 매번 admin 명함 전환할 필요 없음 (PRD §C 의도).
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./supabase/server";
import {
  IDENTITY_COOKIE,
  UUID_RE,
  type ActiveIdentity,
} from "./identity-shared";

export type { ActiveIdentity } from "./identity-shared";

export type AdminPageGuardResult = {
  user: { id: string; email: string | null };
  active: ActiveIdentity;
  /** 묶음에 admin role profile 1개 이상 — 전체 admin 접근 허용 */
  isSuperAdmin: boolean;
  /** active 가 doctor + doctor_accounts 매핑 — 본인 doctor 한정 admin */
  isDoctorAdmin: boolean;
  /** active doctor_accounts.doctor_id (isDoctorAdmin 일 때만 의미) */
  activeDoctorId: string | null;
  /** 묶음 안 첫 admin profile.id (없으면 null) */
  adminProfileId: string | null;
};

/**
 * admin 권한 검사 (묶음 OR) + active identity 컨텍스트 반환.
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

  // 묶음 OR — 같은 auth_user_id 묶음 안의 admin profile 검색
  const { data: adminRows } = await supabase
    .from("profiles")
    .select("id, role")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .eq("role", "admin");
  const admin = (adminRows ?? [])[0] as { id: string } | undefined;
  const adminProfileId = admin?.id ?? null;
  const isSuperAdmin = !!admin;

  // active identity 결정 — cookie 'pibutenten:identity' 또는 primary
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(IDENTITY_COOKIE)?.value ?? "primary";
  let targetProfileId = user.id;
  if (cookieVal !== "primary" && UUID_RE.test(cookieVal)) {
    targetProfileId = cookieVal;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, role, auth_user_id")
    .eq("id", targetProfileId)
    .maybeSingle();

  // 본인 묶음 멤버 검증 — 다른 사람 profile cookie 위조 차단
  let active: ActiveIdentity | null = null;
  if (
    profile &&
    (profile.auth_user_id === user.id || targetProfileId === user.id)
  ) {
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
      doctorId,
    };
  }

  const isDoctorAdmin = !!active?.doctorId;

  // 권한 체크 —
  //   기본: super admin (묶음) OR doctor admin (active) 통과
  //   superAdminOnly=true: super admin 만 통과 (doctor 차단; users/doctors 관리 페이지용)
  if (opts?.superAdminOnly) {
    if (!isSuperAdmin) {
      redirect("/login?error=관리자 권한이 필요합니다");
    }
  } else if (!isSuperAdmin && !isDoctorAdmin) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // active 가 위변조 등으로 null 이면 safety net
  if (!active) {
    redirect("/login?error=세션이 만료되었습니다");
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    active,
    isSuperAdmin,
    isDoctorAdmin,
    activeDoctorId: active.doctorId,
    adminProfileId,
  };
}
