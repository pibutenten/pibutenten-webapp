import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // /admin 루트는 /me 통합 대시보드로 합쳐졌습니다.
  // 통계·운영도구 카드는 /me에서 노출되며, deep link(/admin/users 등)는 그대로 사용 가능.
  redirect("/me");

  // 카운트: 글 status 별 + 회원 통계
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

  // 날짜 helper
  const now = new Date();
  const isoDaysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
  const startOfTodayKst = (() => {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - 9 * 60 * 60 * 1000).toISOString();
  })();

  // 회원 수 (전체 + 일반 + 원장 + 30일 신규)
  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: doctorUsers },
    { count: newUsers30d },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "user"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "doctor"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(30)),
  ]);

  // 새 카드 통계 (오늘 / 7일 / 30일 + 30일 칼럼)
  const [
    { count: cardsToday },
    { count: cards7d },
    { count: cards30d },
    { count: articles30d },
  ] = await Promise.all([
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfTodayKst),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(7)),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(30)),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("type", "article")
      .gte("created_at", isoDaysAgo(30)),
  ]);

  return (
    <section className="w-full py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">관리자</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        환영합니다, <b>{profile.display_name}님</b>.
      </p>

      {/* 회원 통계 — 전체 / 일반 / 원장 / 30일 신규 */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:gap-3">
        <Link
          href="/admin/users"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center transition-colors hover:border-[var(--primary)] sm:p-3"
        >
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            전체 회원
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(totalUsers ?? 0).toLocaleString()}
          </div>
        </Link>
        <Link
          href="/admin/users?role=user"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center transition-colors hover:border-[var(--primary)] sm:p-3"
        >
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            일반 회원
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(activeUsers ?? 0).toLocaleString()}
          </div>
        </Link>
        <Link
          href="/admin/users?role=doctor"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center transition-colors hover:border-[var(--primary)] sm:p-3"
        >
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            원장
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(doctorUsers ?? 0).toLocaleString()}
          </div>
        </Link>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center sm:p-3">
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            30일 신규
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(newUsers30d ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 새 카드 통계 — 오늘 / 7일 / 30일 / 30일 칼럼 */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center sm:p-3">
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            오늘 새 카드
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(cardsToday ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center sm:p-3">
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            7일 새 카드
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(cards7d ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center sm:p-3">
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            30일 새 카드
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(cards30d ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-2 text-center sm:p-3">
          <div className="text-[11px] text-[var(--text-muted)] sm:text-xs">
            30일 새 칼럼
          </div>
          <div className="mt-0.5 text-lg font-bold text-[var(--text)] sm:text-xl">
            {(articles30d ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

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

        <Link
          href="/admin/users"
          className="group rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 transition-colors hover:border-[var(--primary)]"
        >
          <div className="mb-2 text-2xl">👥</div>
          <div className="text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
            회원 관리
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            등급·활동·작성글 관리
          </div>
        </Link>
      </div>

      {/* 로그아웃 — 관리자 본인 정보 페이지 (admin이 본인 회원 정보 페이지로 사용) */}
      <div className="mt-10 flex justify-end border-t border-[var(--border)] pt-6">
        <LogoutButton />
      </div>
    </section>
  );
}
