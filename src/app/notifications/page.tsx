import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  // role 조회 — 운영(검수/발행) 필터를 doctor/admin에게만 노출하기 위함.
  // Phase 9 묶음 — 본인 묶음 내 profile 중 가장 권한 높은 role 사용.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`);
  const roles = (profiles ?? []).map((p) => p.role as string);
  const isAdmin = roles.includes("admin");
  const isDoctor = roles.includes("doctor");
  const showOps = isAdmin || isDoctor;

  return (
    <section className="w-full py-6">
      <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">알림</h1>
      <NotificationsClient showOps={showOps} />
    </section>
  );
}
