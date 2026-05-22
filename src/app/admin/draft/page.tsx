import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page-guard";
import DraftClient from "./DraftClient";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "신규 Q&A 추출",
  robots: { index: false, follow: false },
};

export default async function AdminDraftPage() {
  // 새 Q&A 추출하기는 super admin 전용 (active 도 admin role 이어야).
  // 2026-05-22: active 가 doctor 면 (super admin 묶음이라도) 본인 대시보드로 보냄.
  const guard = await requireAdminPage("/admin/draft");
  const isActiveAdmin = guard.isSuperAdmin && guard.active?.role === "admin";
  if (!isActiveAdmin) {
    if (guard.active?.role === "doctor" && guard.activeDoctorId) {
      redirect("/doctor");
    }
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 flex items-baseline justify-between pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">새 Q&A 추출하기</h1>
        
      </div>
      <DraftClient />
    </section>
  );
}
