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

  return (
    <section className="w-full py-6">
      <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">알림</h1>
      <NotificationsClient />
    </section>
  );
}
