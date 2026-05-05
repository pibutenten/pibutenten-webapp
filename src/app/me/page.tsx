import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  // doctor 매핑 + 본인 글 통계
  let doctorSlug: string | null = null;
  let postsCount = 0;
  if (profile.role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id, doctor:doctors(slug)")
      .eq("profile_id", user.id)
      .maybeSingle()
      .returns<{ doctor_id: string; doctor: { slug: string } | null }>();
    doctorSlug = da?.doctor?.slug ?? null;
    if (da?.doctor_id) {
      const { count } = await supabase
        .from("qas")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", da.doctor_id);
      postsCount = count ?? 0;
    }
  }

  return (
    <section className="mx-auto w-full max-w-[820px] py-6">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">
        {profile.display_name}{" "}
        {profile.role === "doctor" && (
          <span className="text-base font-medium text-[var(--text-secondary)]">
            원장님
          </span>
        )}
      </h1>
      <p className="text-sm text-[var(--text-muted)]">
        역할: {profile.role === "doctor" ? "원장" : profile.role === "admin" ? "관리자" : "사용자"}
        {profile.role === "doctor" && doctorSlug && (
          <>
            {" · "}
            <Link
              href={`/doctors/${doctorSlug}`}
              className="text-[var(--primary)] hover:underline"
            >
              내 공개 페이지 →
            </Link>
          </>
        )}
      </p>

      {profile.role === "doctor" && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
            <div className="text-xs text-[var(--text-muted)]">발행된 글</div>
            <div className="mt-1 text-2xl font-bold">{postsCount}</div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-sm text-[var(--text-secondary)]">
        <p>마이페이지 — 다음 단계(Phase A.3)에서 구현 예정:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>본인 글 목록 + 수정/삭제</li>
          <li>검수 대기 초안 [저장]/[발행]/[반려]</li>
          <li>좋아요·조회수 통계</li>
          <li>이메일/비밀번호/닉네임 변경</li>
        </ul>
      </div>
    </section>
  );
}
