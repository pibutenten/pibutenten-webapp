import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import WriteTabs from "./WriteTabs";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "글쓰기 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default async function BetaWritePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: "admin" | "doctor" | "user" = "user";
  let displayName = "";
  let myDoctor: { slug: string; name: string } | null = null;
  let doctors: Doctor[] = [];

  if (user) {
    const idCtx = await getIdentityContext(supabase);
    if (idCtx?.active) {
      role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";
      displayName = idCtx.active.displayName ?? "";
      if (role === ROLES.DOCTOR && idCtx.active.doctorId) {
        const { data: d } = await supabase
          .from("doctors").select("slug, name").eq("id", idCtx.active.doctorId)
          .maybeSingle().returns<{ slug: string; name: string } | null>();
        myDoctor = d ?? null;
      }
      if (role === ROLES.ADMIN) {
        const { data } = await supabase
          .from("doctors").select("id, slug, name, branch").order("name", { ascending: true })
          .returns<Doctor[]>();
        doctors = data ?? [];
      }
    }
  }

  return <WriteTabs isLoggedIn={!!user} role={role} displayName={displayName} myDoctor={myDoctor} doctors={doctors} />;
}
