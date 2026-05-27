import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationPreferences from "@/components/NotificationPreferences";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import BackButton from "@/components/BackButton";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림 설정",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx) redirect("/login?next=/settings/notifications");
  if (!idCtx.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  // role 판정은 **active profile 한 장** 기준 (CLAUDE.md 원칙 #1).
  // Critical-2 (2026-05-27): 묶음 OR 합산 폐지. 현재 active 신분의 role 만 사용.
  const activeRole = idCtx.active.role;
  const role: "admin" | "doctor" | "user" =
    activeRole === "admin" || activeRole === "doctor"
      ? activeRole
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
