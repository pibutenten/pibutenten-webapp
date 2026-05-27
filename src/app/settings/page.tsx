import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorSlugForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * /settings: 본인 프로필로 redirect.
 *  - admin → /admin
 *  - doctor (doctor_accounts 매핑 있음) → /doctors/{slug}
 *  - 그 외 → /{handle}
 *  - handle 미설정 → /
 */
export default async function MeRedirect() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

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

  // 관리자 — 본인 프로필 안 만들고 대시보드로
  if (profile.role === ROLES.ADMIN) redirect("/admin");

  // 의사 — doctor 매핑 있으면 /doctors/{slug} (SSOT: profiles.doctor_id)
  if (profile.role === ROLES.DOCTOR) {
    const slug = await getDoctorSlugForProfile(supabase, user.id);
    if (slug) redirect(`/doctors/${slug}`);
  }

  // 그 외 — handle 기반
  if (profile.handle) redirect(`/${profile.handle}`);

  redirect("/");
}
