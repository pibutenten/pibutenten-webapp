import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferences from "@/components/NotificationPreferences";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import BackButton from "@/components/BackButton";
import { bundleProfileFilter } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림 설정",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/notifications");

  // Phase 9 묶음 인지 — 본인 묶음 내 profile 중 가장 권한 높은 role 사용
  const { data: profiles } = await supabase
    .from("profiles")
    .select("role")
    .or(bundleProfileFilter(user.id));
  const roles = (profiles ?? []).map((p) => p.role as string);
  const role: "admin" | "doctor" | "user" = roles.includes("admin")
    ? "admin"
    : roles.includes("doctor")
      ? "doctor"
      : "user";

  return (
    <section className="mx-auto w-full max-w-[640px] py-6">
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/notifications" />
      </div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">알림 설정</h1>
        <Link
          href="/notifications"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          알림 목록
        </Link>
      </div>
      <p className="mb-5 text-sm text-[var(--text-secondary)]">
        받고 싶은 알림 종류를 각각 켜고 끌 수 있어요. 변경은 즉시 저장됩니다.
      </p>
      <div className="space-y-4">
        <PushNotificationToggle />
        <NotificationPreferences role={role} />
      </div>
    </section>
  );
}
