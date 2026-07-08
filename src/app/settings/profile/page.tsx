import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getDoctorSlugForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * /settings/profile — 설정 화면으로 redirect (경유지).
 *
 * UI 개편 Phase 4 (2026-07-08, D9): 프로필 편집은 전용 화면 /my/settings 가 담당한다.
 *   구 동선(본인 공개 프로필 /{handle} 의 '프로필·설정' 아코디언, ProfileEditClient embedded)은
 *   프로필 신디자인에서 제거됐으므로, 이 라우트로의 직접 접속·기존 링크(투데이 키워드 등록,
 *   내 노트 관심 키워드, 온보딩 안내 등)는 /my/settings 로 보낸다.
 *   ProfileEditClient 와 저장 API(/api/profile…)는 무수정 — /my/settings 가 그대로 재사용.
 *
 *  - admin → /admin
 *  - doctor (doctor_accounts 매핑 있음) → /doctors/{slug} (기존 동선 유지)
 *  - 그 외(회원·clinic 포함) → /my/settings — clinic 은 /my/settings 가 /clinic 으로 재분기
 *  - 비로그인 → /login?next=/settings/profile
 */
export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;

  if (active?.role === ROLES.ADMIN) redirect("/admin");
  if (active?.role === ROLES.DOCTOR) {
    const slug = await getDoctorSlugForProfile(supabase, user.id);
    if (slug) redirect(`/doctors/${slug}`);
  }

  // 회원(및 그 외) — 설정 전용 화면. 역할 재검증(clinic→/clinic 등)은 /my/settings 가 수행.
  redirect("/my/settings");
}
