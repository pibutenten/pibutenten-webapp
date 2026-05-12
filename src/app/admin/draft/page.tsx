import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DraftClient from "./DraftClient";

export const dynamic = "force-dynamic";

export default async function AdminDraftPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/draft");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // 원장 9명 목록 (slug + name) — 매칭 dropdown용
  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, slug, name, branch")
    .order("sort_order", { ascending: true });

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">Q&A 추출하기</h1>
        <Link
          href="/admin/qas"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 전체 목록
        </Link>
      </div>
      <DraftClient doctors={doctors ?? []} />
    </section>
  );
}
