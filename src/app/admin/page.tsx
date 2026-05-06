import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * /admin 루트는 /me 통합 대시보드로 합쳐졌습니다.
 * 운영 도구 카드는 /me에서 노출되며, deep link(/admin/users, /admin/qas, /admin/draft 등)는 그대로 사용 가능.
 */
export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  redirect("/me");
}
