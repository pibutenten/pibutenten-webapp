import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getDoctorSlugForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * /settings — 본인 프로필로 redirect.
 *
 * 신규 스킨 승격(2026-06-15): 설정은 별도 페이지가 아니라 본인 공개 프로필(/{handle})의
 *   '프로필·설정' 아코디언으로 인라인 편집한다(승격된 BetaProfileView, ProfileEditClient embedded).
 *   따라서 이 라우트로의 직접 접속·기존 링크는 본인 공개 프로필로 redirect 한다(동선 통일).
 *
 *  - admin → /admin
 *  - doctor (doctor_accounts 매핑 있음) → /doctors/{slug}
 *  - 그 외(회원) → /{handle} (active 명함 handle, getIdentityContext SSOT)
 *  - handle 미설정 → /
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

  // 회원 — active 명함 handle 기반 본인 공개 프로필(아코디언으로 설정 인라인 편집).
  if (active?.handle) redirect(`/${active.handle}`);

  // active 컨텍스트가 없거나 handle 미설정 — base 프로필 handle fallback.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, handle")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: "user" | "doctor" | "admin";
      handle: string | null;
    }>();

  if (!profile) redirect("/");
  if (profile.role === ROLES.ADMIN) redirect("/admin");
  if (profile.role === ROLES.DOCTOR) {
    const slug = await getDoctorSlugForProfile(supabase, user.id);
    if (slug) redirect(`/doctors/${slug}`);
  }
  if (profile.handle) redirect(`/${profile.handle}`);

  redirect("/");
}
