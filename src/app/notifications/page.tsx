import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationsClient from "./NotificationsClient";
import BackButton from "@/components/BackButton";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx) redirect("/login?next=/notifications");
  if (!idCtx.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  // 운영(검수/발행) 필터 노출 판정은 **active profile 한 장** 기준 (CLAUDE.md 원칙 #1).
  // Critical-2 (2026-05-27): 묶음 OR 합산 폐지. 현재 active 신분의 role 만 사용.
  const activeRole = idCtx.active.role;
  const isAdmin = activeRole === "admin";
  const isDoctor = activeRole === "doctor";
  const showOps = isAdmin || isDoctor;

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">알림</h1>
      </div>
      <NotificationsClient showOps={showOps} />
    </section>
  );
}
