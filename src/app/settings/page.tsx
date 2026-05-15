import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (profile.role === "admin") redirect("/admin");

  // 의사 — doctor_accounts 매핑 있으면 /doctors/{slug}
  if (profile.role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor:doctors(slug)")
      .eq("profile_id", user.id)
      .maybeSingle();
    const d = da?.doctor as { slug: string } | { slug: string }[] | null;
    const slug = Array.isArray(d) ? d[0]?.slug : d?.slug;
    if (slug) redirect(`/doctors/${slug}`);
  }

  // 그 외 — handle 기반
  if (profile.handle) redirect(`/${profile.handle}`);

  redirect("/");
}
