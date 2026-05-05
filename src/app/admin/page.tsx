import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  return (
    <section className="mx-auto w-full max-w-[820px] py-6">
      <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">관리자</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        환영합니다, <b>{profile.display_name}</b> 님.
      </p>
      <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-sm text-[var(--text-secondary)]">
        <p>관리자 대시보드 — 다음 단계(Phase A.2)에서 구현 예정:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>전체 Q&A 목록 + CRUD</li>
          <li>영상 URL 입력 → AI Q&A 초안 생성</li>
          <li>원장 계정 관리</li>
        </ul>
      </div>
    </section>
  );
}
