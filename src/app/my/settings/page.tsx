import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { buildProfileSettingsProps } from "@/lib/profile-settings-data";
import MySettingsView from "@/components/skin/mypage/MySettingsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "설정",
  robots: { index: false, follow: false },
};

/**
 * /my/settings — 프로필·설정 전용 화면 (UI 개편 Phase 4-1, D9 원장 확정).
 *
 * 구 동선: 본인 공개 프로필(/{handle})의 '프로필·설정' 아코디언(ProfileEditClient embedded).
 * 신디자인 프로필 2뎁스에는 아코디언 자리가 없어(시안) 전용 라우트로 분리했다.
 *   - 데이터 조립은 구 [handle]/page.tsx 로직을 추출한 buildProfileSettingsProps 공용 함수
 *     (active 명함 base SELECT + get_profile_pii RPC 병합 — PII 직접 SELECT 금지).
 *   - 탈퇴(typed-confirmation → /api/me/delete)는 ProfileEditClient 내장 footer 그대로.
 *   - 연결된 병원 관리(ClinicLinksSection)는 MySettingsView 에서 무조건 렌더(Phase 4-4).
 *
 * 게이트 (my/page.tsx 패턴 준용):
 *   - 비로그인 → /login?next=/my/settings
 *   - admin → /admin · doctor → /doctor · clinic → /clinic (각 대시보드가 설정 진입점 보유)
 *   - profiles row 부재(이론상 거의 없음) → /
 *
 * 라우트 지위: 최상위가 아닌 기예약 `my` 의 하위 → RESERVED_FIRST_SEGMENT·reserved_handles
 * 갱신 불필요(계획서 §8 판정). robots 는 page 메타 noindex 로 충분(/my 는 robots.ts DISALLOW).
 * GlobalChrome 은 APP_SHELL_PREFIX "/my/" 로 이미 앱 셸 승격.
 */
export default async function MySettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my/settings");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active ?? null;
  if (active?.role === ROLES.ADMIN) redirect("/admin");
  if (active?.role === ROLES.DOCTOR) redirect("/doctor");
  if (active?.role === ROLES.CLINIC) redirect("/clinic"); // 병원 계정 — 회원 설정 대신 병원 대시보드

  // active 명함 기준 설정 폼 props (공용 함수 — active 재조회 없이 전달).
  const settings = await buildProfileSettingsProps(supabase, user, active);
  if (!settings) redirect("/");

  return <MySettingsView settings={settings} />;
}
