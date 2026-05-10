import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 대시보드",
  robots: { index: false, follow: false },
};

/**
 * /admin — 관리자 전용 대시보드 (v4 spec).
 * 영구 noindex. 운영 통계 + 모더레이션 + 회원 관리 + 검색어/태그 인기도 + AEO/GEO log.
 */
export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // 운영 통계 — 회원·글·댓글 카운트
  const [
    { count: userCount },
    { count: doctorCount },
    { count: qaPublished },
    { count: postPublished },
    { count: pendingReview },
    { count: totalComments },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "doctor"),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("type", "qa")
      .eq("status", "published"),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("type", "post")
      .eq("status", "published"),
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible"),
  ]);

  return (
    <section className="w-full py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[var(--text)]">관리자 대시보드</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          운영 통계·모더레이션·회원 관리 (영구 noindex)
        </p>
      </div>

      {/* 운영 통계 — 카드 6개 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="전체 회원" value={userCount ?? 0} />
        <Stat label="원장" value={doctorCount ?? 0} />
        <Stat label="발행 Q&A" value={qaPublished ?? 0} />
        <Stat label="발행 포스팅" value={postPublished ?? 0} />
        <Stat
          label="검수 대기"
          value={pendingReview ?? 0}
          highlight={(pendingReview ?? 0) > 0}
        />
        <Stat label="댓글" value={totalComments ?? 0} />
      </div>

      {/* 운영 도구 — 깊은 페이지 진입점 */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
          운영 도구
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Tool
            href="/admin/qas"
            emoji="📚"
            title="전체 글 관리"
            desc="Q&A·포스팅 검색·필터·발행/보관"
          />
          <Tool
            href="/admin/draft"
            emoji="📝"
            title="초안 / 검수 대기"
            desc={
              (pendingReview ?? 0) > 0
                ? `${pendingReview}개 검수 대기 중 →`
                : "AI 초안 생성·원장 검수"
            }
            highlight={(pendingReview ?? 0) > 0}
          />
          <Tool
            href="/admin/users"
            emoji="👥"
            title="회원 관리"
            desc="권한 변경·원장 매핑·계정 관리"
          />
          <Tool
            href="/admin/doctors"
            emoji="🩺"
            title="의사 프로필 관리"
            desc="학력·경력·전문분야 등 확장 프로필"
          />
        </div>
      </div>

      {/* 자주 쓰는 진입점 */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
          자주 쓰는 진입점
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/qas?status=pending_review"
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            ⏳ 검수 대기 큐
          </Link>
          <Link
            href="/admin/qas?pick=1"
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            ⭐ Pick 관리
          </Link>
          <Link
            href="/write"
            className="rounded-full border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/15"
          >
            ✍️ 새 글 쓰기
          </Link>
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--text-muted)]">
        ※ 검색어/태그 인기도 통계와 AEO/GEO 로그는 Phase E에서 추가됩니다.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-[var(--radius)] border bg-white p-4 " +
        (highlight ? "border-amber-300" : "border-[var(--border)]")
      }
    >
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div
        className={
          "mt-1 text-2xl font-bold tabular-nums " +
          (highlight ? "text-amber-700" : "text-[var(--text)]")
        }
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex items-center gap-3 rounded-[var(--radius)] border bg-white p-4 transition-colors " +
        (highlight
          ? "border-amber-300 hover:border-amber-400"
          : "border-[var(--border)] hover:border-[var(--primary)]")
      }
    >
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--text)]">{title}</div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{desc}</div>
      </div>
      <span className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--primary)]">
        →
      </span>
    </Link>
  );
}
