import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getDoctorSlugForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * /settings — 설정 화면으로 redirect (경유지).
 *
 * UI 개편 Phase 4 (2026-07-08, D9): 설정은 전용 화면 /my/settings 가 담당한다.
 *   구 동선(본인 공개 프로필 /{handle} 의 '프로필·설정' 아코디언)은 프로필 신디자인에서
 *   제거됐으므로, 이 라우트로의 직접 접속·기존 링크는 /my/settings 로 보낸다.
 *   (구 코드가 /{handle} 로 보내면 설정 UI 가 없는 화면에 떨어지는 dead-end.)
 *
 *  - admin → /admin
 *  - doctor (doctor_accounts 매핑 있음) → /doctors/{slug} (기존 동선 유지)
 *  - 그 외(회원·clinic 포함) → /my/settings — clinic 은 /my/settings 가 /clinic 으로 재분기
 *  - 비로그인 → /login?next=/settings
 */
export default async function MeRedirect() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;

  // 관리자 — 본인 프로필 안 만들고 대시보드로
  if (active?.role === ROLES.ADMIN) redirect("/admin");

  // 의사 — doctor 매핑 있으면 /doctors/{slug} (SSOT: profiles.doctor_id)
  if (active?.role === ROLES.DOCTOR) {
    const slug = await getDoctorSlugForProfile(supabase, user.id);
    if (slug) redirect(`/doctors/${slug}`);
  }

  // 회원(및 그 외) — 설정 전용 화면. 역할 재검증(clinic→/clinic 등)은 /my/settings 가 수행.
  redirect("/my/settings");
}
