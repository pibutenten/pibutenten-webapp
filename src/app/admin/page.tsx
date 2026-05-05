import { redirect } from "next/navigation";
import Link from "next/link";
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

  // 카운트 5개 (status 별)
  const statuses = ["draft", "pending_review", "published", "archived"] as const;
  const counts = await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase
        .from("qas")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      return { status: s, count: count ?? 0 };
    }),
  );

  return (
    <section className="w-full py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">관리자</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        환영합니다, <b>{profile.display_name}</b> 님.
      </p>

      {/* 상태별 카운트 — 위쪽, 모바일도 4개 한 줄 */}
      <div className="mb-5 grid grid-cols-4 gap-2 sm:gap-3">
        {counts.map(({ status, count }) => (
          <Link
            key={status}
            href={`/admin/qas?status=${status}`}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center transition-colors hover:border-[var(--primary)] sm:p-3"
          >
            <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
              {status === "draft" && "초안"}
              {status === "pending_review" && "대기"}
              {status === "published" && "발행"}
              {status === "archived" && "보관"}
            </div>
            <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
              {count}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/admin/draft"
          className="group rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-2 text-2xl">✨</div>
          <div className="text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
            새 Q&A 초안 (URL → AI)
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            YouTube URL 입력하면 자막 fetch + Claude 자동 생성
          </div>
        </Link>

        <Link
          href="/write"
          className="group rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-2 text-2xl">✏️</div>
          <div className="text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
            새 글쓰기
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            관리자: 어느 원장 명의로도 작성 가능 (post / article)
          </div>
        </Link>

        <Link
          href="/admin/qas"
          className="group rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-2 text-2xl">📋</div>
          <div className="text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
            전체 카드 목록
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            포스팅·Q&A·칼럼 모든 카드 — 검수·수정·발행·삭제
          </div>
        </Link>

        <Link
          href="/admin/qas?type=article"
          className="group rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-2 text-2xl">📚</div>
          <div className="text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
            전체 칼럼 목록
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            원장님 칼럼만 모아보기
          </div>
        </Link>
      </div>

    </section>
  );
}
