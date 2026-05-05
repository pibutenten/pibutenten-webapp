import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  return (
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">내 정보</h1>
        <Link
          href="/me"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 마이페이지
        </Link>
      </div>

      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-sm">
        <div className="flex justify-between border-b border-[var(--border)] pb-2">
          <span className="text-[var(--text-muted)]">이메일</span>
          <span className="text-[var(--text)]">{user.email ?? "-"}</span>
        </div>
        <div className="flex justify-between border-b border-[var(--border)] pb-2">
          <span className="text-[var(--text-muted)]">닉네임</span>
          <span className="text-[var(--text)]">{profile.display_name ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">역할</span>
          <span className="text-[var(--text)]">
            {profile.role === "doctor" ? "원장" : profile.role === "admin" ? "관리자" : "사용자"}
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--bg-soft)] p-5 text-sm text-[var(--text-secondary)]">
        <p className="font-semibold">곧 추가될 기능</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>닉네임 변경</li>
          <li>비밀번호 변경</li>
          <li>이메일 변경 (재인증)</li>
          <li>마케팅 이메일 수신 동의</li>
        </ul>
      </div>
    </section>
  );
}
