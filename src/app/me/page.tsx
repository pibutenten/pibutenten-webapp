import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPersonaServer } from "@/lib/persona-server";

export const dynamic = "force-dynamic";

/**
 * v4: /me는 본인 프로필(/{handle} 또는 /doctors/{slug})로 redirect.
 * 옛 북마크·외부 링크·헤더 fallback 보존용.
 *
 * - 의사 official 페르소나 → /doctors/{slug}
 * - 그 외 (회원·의사 personal·관리자): /{handle 또는 alt_handle}
 * - handle 미설정 시 fallback /
 */
export default async function MeRedirect() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, handle, alt_handle")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: "user" | "doctor" | "admin";
      handle: string | null;
      alt_handle: string | null;
    }>();

  if (!profile) redirect("/");

  const persona = (await readPersonaServer()) as "official" | "personal";

  // 의사 official — /doctors/{slug}
  if (profile.role === "doctor" && persona === "official") {
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
  const handle =
    persona === "personal"
      ? profile.alt_handle ?? profile.handle
      : profile.handle ?? profile.alt_handle;
  if (handle) redirect(`/${handle}`);

  redirect("/");
}
