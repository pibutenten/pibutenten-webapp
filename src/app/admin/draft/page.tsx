import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import DraftClient from "./DraftClient";

export const dynamic = "force-dynamic";

export default async function AdminDraftPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/draft");

  // 새 Q&A 추출하기는 super admin (active.kind='admin') 전용.
  // 원장 admin은 검수만 가능 → /admin/cards?status=pending_review 로 redirect.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }
  if (!idCtx.isSuperAdmin) {
    if (idCtx.isDoctorAdmin) {
      redirect("/admin/cards?status=pending_review");
    }
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return (
    <section className="w-full py-6">
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
