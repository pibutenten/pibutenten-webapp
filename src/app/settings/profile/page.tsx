import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getDoctorSlugForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * /settings/profile — 본인 프로필로 redirect.
 *
 * 신규 스킨 승격(2026-06-15): 프로필·설정 편집은 별도 페이지가 아니라 본인 공개 프로필(/{handle})의
 *   '프로필·설정' 아코디언으로 인라인 처리한다(승격된 ProfileView, ProfileEditClient embedded).
 *   기존 저장 API(/api/profile…) 와 ProfileEditClient 는 무수정 — 아코디언이 그대로 재사용한다.
 *   따라서 이 라우트로의 직접 접속·기존 링크는 본인 공개 프로필로 redirect 한다(동선 통일).
 *
 *  - admin → /admin
 *  - doctor (doctor_accounts 매핑 있음) → /doctors/{slug}
 *  - 그 외(회원) → /{handle} (active 명함 handle, getIdentityContext SSOT)
 *  - handle 미설정 → /
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
  if (active?.handle) redirect(`/${active.handle}`);

  // active 컨텍스트 없음/handle 미설정 — base 프로필 handle fallback.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, handle")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: "user" | "doctor" | "admin";
      handle: string | null;
    }>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");
  if (profile.role === ROLES.ADMIN) redirect("/admin");
  if (profile.role === ROLES.DOCTOR) {
    const slug = await getDoctorSlugForProfile(supabase, user.id);
    if (slug) redirect(`/doctors/${slug}`);
  }
  if (profile.handle) redirect(`/${profile.handle}`);

  redirect("/");
}
