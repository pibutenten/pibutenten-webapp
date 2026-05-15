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
  // 새 Q&A 추출하기는 super admin (묶음에 admin role) 전용.
  // 원장 admin (active doctor) 은 검수만 가능 → /admin/cards?status=pending_review 로 redirect.
  const guard = await requireAdminPage("/admin/draft");
  if (!guard.isSuperAdmin) {
    if (guard.isDoctorAdmin) {
      redirect("/admin/cards?status=pending_review");
    }
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 flex items-baseline justify-between pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">새 Q&A 추출하기</h1>
        <Link
          href="/admin/cards"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 전체 목록
        </Link>
      </div>
      <DraftClient />
    </section>
  );
}
