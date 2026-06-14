import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import NotificationsView from "./NotificationsView";
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

  // 본문은 운영 형태(NotificationsClient)를 그대로 유지하되 베타 셸로 감싸 렌더
  //   (DoctorDashboardView·ProcedureReportView 선례 동일). 데이터·권한 가드·metadata(noindex)는
  //   위 server 로직이 100% 책임, 표시만 View 에 위임.
  return <NotificationsView showOps={showOps} />;
}
