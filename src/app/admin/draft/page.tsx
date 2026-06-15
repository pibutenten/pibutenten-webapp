import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import BetaAdminDraftView from "./BetaAdminDraftView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "신규 Q&A 추출",
  robots: { index: false, follow: false },
};

/**
 * /admin/draft — 새 Q&A 추출하기 (베타 셸 적용, Phase 3 ②).
 *
 * 원칙: 가드·권한 분기 로직은 운영 그대로 유지하고, 렌더만 BetaAdminDraftView(베타 셸 래퍼)로 위임한다.
 *   상단 바·배경만 베타 톤으로 통일하고 본문 위저드(DraftClient)는 무수정 임베드.
 */
export default async function AdminDraftPage() {
  // 새 Q&A 추출하기는 super admin 전용 (active 도 admin role 이어야).
  // 2026-05-22: active 가 doctor 면 (super admin 묶음이라도) 본인 대시보드로 보냄.
  const guard = await requireAdminPage("/admin/draft");
  const isActiveAdmin = guard.isSuperAdmin && guard.active?.role === ROLES.ADMIN;
  if (!isActiveAdmin) {
    if (guard.active?.role === ROLES.DOCTOR && guard.activeDoctorId) {
      redirect("/doctor");
    }
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return <BetaAdminDraftView />;
}
