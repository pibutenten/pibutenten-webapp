import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Stats = {
  totalPosts: number;
  publishedCount: number;
  pendingCount: number;
  draftCount: number;
  archivedCount: number;
  pickCount: number;
  totalLikes: number;
  totalViews: number;
  totalComments: number;
  todayLikes: number;
  todayViews: number;
};

const EMPTY_STATS: Stats = {
  totalPosts: 0,
  publishedCount: 0,
  pendingCount: 0,
  draftCount: 0,
  archivedCount: 0,
  pickCount: 0,
  totalLikes: 0,
  totalViews: 0,
  totalComments: 0,
  todayLikes: 0,
  todayViews: 0,
};

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

  // doctor 매핑
  let doctorSlug: string | null = null;
  let doctorId: string | null = null;
  if (profile.role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id, doctor:doctors(slug)")
      .eq("profile_id", user.id)
      .maybeSingle()
      .returns<{ doctor_id: string; doctor: { slug: string } | null }>();
    doctorSlug = da?.doctor?.slug ?? null;
    doctorId = da?.doctor_id ?? null;
  }

  // 통계 — doctor일 때만
  let stats: Stats = EMPTY_STATS;
  if (doctorId) {
    // status별 count + 합계
    const [
      { count: totalPosts },
      { count: publishedCount },
      { count: pendingCount },
      { count: draftCount },
      { count: archivedCount },
      { count: pickCount },
      { data: aggData },
    ] = await Promise.all([
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId),
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId).eq("status", "published"),
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId).eq("status", "pending_review"),
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId).eq("status", "draft"),
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId).eq("status", "archived"),
      supabase.from("qas").select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId).eq("is_pick", true),
      supabase.from("qas").select("like_count, view_count, id")
        .eq("doctor_id", doctorId)
        .returns<{ like_count: number | null; view_count: number | null; id: number }[]>(),
    ]);

    let totalLikes = 0;
    let totalViews = 0;
    const qaIds: number[] = [];
    if (aggData) {
      for (const r of aggData) {
        totalLikes += r.like_count ?? 0;
        totalViews += r.view_count ?? 0;
        qaIds.push(r.id);
      }
    }

    // 댓글 수 (Phase B comments — 없으면 0)
    let totalComments = 0;
    if (qaIds.length > 0) {
      try {
        const { count } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("qa_id", qaIds)
          .eq("status", "visible");
        totalComments = count ?? 0;
      } catch {
        totalComments = 0;
      }
    }

    stats = {
      totalPosts: totalPosts ?? 0,
      publishedCount: publishedCount ?? 0,
      pendingCount: pendingCount ?? 0,
      draftCount: draftCount ?? 0,
      archivedCount: archivedCount ?? 0,
      pickCount: pickCount ?? 0,
      totalLikes,
      totalViews,
      totalComments,
      // 오늘 통계는 별도 일자별 집계 테이블이 없으므로 일단 0 (Phase B 이후 확장)
      todayLikes: 0,
      todayViews: 0,
    };
  }

  const isDoctor = profile.role === "doctor" && doctorId;

  return (
    <section className="mx-auto w-full max-w-[820px] py-6">
      {/* 헤더 */}
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

      {!isDoctor && profile.role !== "doctor" && (
        <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-sm text-[var(--text-secondary)]">
          일반 사용자 마이페이지입니다. (작성한 글 / 댓글 관리는 추후 추가됩니다)
        </div>
      )}

      {profile.role === "doctor" && !isDoctor && (
        <div className="mt-6 rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          원장 계정이지만 doctor 매핑이 없습니다. 관리자에게 문의해주세요.
        </div>
      )}

      {isDoctor && (
        <>
          {/* 검수 대기 알림 배너 */}
          {stats.pendingCount > 0 && (
            <Link
              href="/me/qnas?status=pending_review"
              className="mt-5 block rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-amber-900">
                    📝 검수 대기 중인 글이 {stats.pendingCount}개 있어요
                  </div>
                  <div className="mt-0.5 text-xs text-amber-700">
                    AI 초안을 검토하고 발행해주세요 →
                  </div>
                </div>
                <span className="text-amber-700">→</span>
              </div>
            </Link>
          )}

          {/* 통계 카드 */}
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
              통계
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="총 글" value={stats.totalPosts} sub={`발행 ${stats.publishedCount}`} />
              <StatCard label="총 좋아요" value={stats.totalLikes} />
              <StatCard label="총 조회수" value={stats.totalViews} />
              <StatCard label="총 댓글" value={stats.totalComments} />
            </div>
          </div>

          {/* 빠른 액션 4개 */}
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
              빠른 액션
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ActionCard
                href="/me/qnas?status=pending_review"
                emoji="📝"
                title="검수 대기"
                desc={
                  stats.pendingCount > 0
                    ? `${stats.pendingCount}개 검토가 필요해요`
                    : "검수 대기 글 없음"
                }
                badge={stats.pendingCount > 0 ? stats.pendingCount : undefined}
                highlight={stats.pendingCount > 0}
              />
              <ActionCard
                href="/me/qnas"
                emoji="📚"
                title="전체 내 글"
                desc={`총 ${stats.totalPosts}개의 글 관리`}
              />
              <ActionCard
                href="/me/qnas?pick=true"
                emoji="⭐"
                title="Pick 관리"
                desc={`현재 ${stats.pickCount} / 5 (원장님 추천 5개)`}
              />
              <ActionCard
                href="/me/profile"
                emoji="👤"
                title="내 정보"
                desc="이메일, 비밀번호, 닉네임 변경"
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// 작은 컴포넌트
// ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{sub}</div>
      )}
    </div>
  );
}

function ActionCard({
  href,
  emoji,
  title,
  desc,
  badge,
  highlight,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  badge?: number;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group relative flex items-center gap-3 rounded-[var(--radius)] border bg-white p-4 transition-colors " +
        (highlight
          ? "border-amber-300 hover:border-amber-400"
          : "border-[var(--border)] hover:border-[var(--primary)]")
      }
    >
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-[var(--text)]">{title}</div>
          {badge !== undefined && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{desc}</div>
      </div>
      <span className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--primary)]">
        →
      </span>
    </Link>
  );
}
