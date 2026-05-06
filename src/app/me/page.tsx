import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import {
  ROLE_LABELS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  type UserRole,
  type UserLevel,
} from "@/lib/user-grades";

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

type MyStats = {
  score: number;
  level: UserLevel;
  streak: number;
  posts_count: number;
  likes_received: number;
  comments_received: number;
  shares_received: number;
  likes_given: number;
  comments_given: number;
};

export default async function MePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, level, activity_score, bio, avatar_url")
    .eq("id", user.id)
    .maybeSingle()
    .returns<{
      role: UserRole;
      display_name: string | null;
      level: UserLevel;
      activity_score: number;
      bio: string | null;
      avatar_url: string | null;
    }>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  // 일일 로그인 자동 award (이미 오늘이면 no-op) — 일반 사용자만 (원장/관리자 제외)
  if (profile.role === "user") {
    try {
      await supabase.rpc("award_daily_login");
    } catch {
      // 무시: 출석 부여는 실패해도 페이지 렌더링에 영향 없음
    }
  }

  // 본인 종합 통계 — 일반 사용자 Hero 대시보드용
  let myStats: MyStats | null = null;
  if (profile.role === "user") {
    try {
      const { data: statsData } = await supabase.rpc("get_my_stats");
      myStats = (statsData as unknown as MyStats | null) ?? null;
    } catch {
      myStats = null;
    }
  }

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

  // ── 본인 활동 ── (모든 로그인 사용자)
  type ActivityRow = {
    id: number;
    question: string;
    type: "qa" | "post" | "article";
    article_slug: string | null;
    created_at: string;
    doctor: { name: string } | null;
  };

  // 1) 내가 쓴 글 (author_id = me) — 최근 5
  const { data: myPostsData } = await supabase
    .from("qas")
    .select(
      "id, question, type, article_slug, created_at, doctor:doctors(name)",
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<ActivityRow[]>();
  const myPosts: ActivityRow[] = myPostsData ?? [];

  // 2) 내가 좋아요한 글 — 최근 5
  const { data: likedRowsData } = await supabase
    .from("qa_likes")
    .select(
      "qa:qas(id, question, type, article_slug, created_at, doctor:doctors(name))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<{ qa: ActivityRow | null }[]>();
  const likedQas: ActivityRow[] = (likedRowsData ?? [])
    .map((r) => r.qa)
    .filter((x): x is ActivityRow => x !== null);

  // 3) 내가 댓글 단 글 — 최근 5 (distinct qa_id)
  const { data: commentRows } = await supabase
    .from("comments")
    .select(
      "qa_id, created_at, qa:qas(id, question, type, article_slug, created_at, doctor:doctors(name))",
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<{ qa_id: number; qa: ActivityRow | null }[]>();
  const commentedSeen = new Set<number>();
  const commentedQas: ActivityRow[] = [];
  for (const r of commentRows ?? []) {
    if (!r.qa) continue;
    if (commentedSeen.has(r.qa.id)) continue;
    commentedSeen.add(r.qa.id);
    commentedQas.push(r.qa);
    if (commentedQas.length >= 5) break;
  }

  const linkOf = (r: ActivityRow): string =>
    r.type === "article" && r.article_slug
      ? `/article/${encodeURIComponent(r.article_slug)}`
      : `/qa/${r.id}`;

  const typeLabel = (t: ActivityRow["type"]): string =>
    t === "post" ? "포스팅" : t === "article" ? "칼럼" : "Q&A";

  const lvlColor = LEVEL_COLORS[profile.level] ?? LEVEL_COLORS[0];

  return (
    <section className="w-full py-6">
      {/* 헤더 */}
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text)]">
                {profile.display_name ?? "(이름 없음)"}
                {profile.role === "doctor" && (
                  <span className="ml-1 text-sm font-medium text-[var(--text-secondary)]">
                    원장님
                  </span>
                )}
              </h1>
              <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
              {profile.role === "user" && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                >
                  {LEVEL_LABELS[profile.level] ?? "일반"}
                </span>
              )}
              <Link
                href="/me/profile"
                className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
              >
                프로필 수정 ✏️
              </Link>
            </div>
            {profile.bio && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {profile.bio}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              {profile.role === "user" && (
                <span>활동점수 {profile.activity_score.toLocaleString()}</span>
              )}
              {profile.role === "doctor" && doctorSlug && (
                <Link
                  href={`/doctors/${doctorSlug}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  내 공개 페이지 →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Stats — 일반 사용자에게만 노출 */}
      {profile.role === "user" && myStats && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBig
              label="활동점수"
              emoji="🌟"
              value={myStats.score}
              sub={LEVEL_LABELS[myStats.level] ?? "일반"}
              subLevel={myStats.level}
            />
            <StatBig
              label="연속 출석"
              emoji="🔥"
              value={myStats.streak}
              suffix="일"
            />
            <StatBig
              label="받은 좋아요"
              emoji="❤️"
              value={myStats.likes_received}
            />
            <StatBig
              label="작성한 글"
              emoji="📝"
              value={myStats.posts_count}
            />
          </div>

          {/* 받은 인정 + 내가 남긴 흔적 — 한 카드 안에 큰 숫자 5개, 가운데 점선으로 구분 */}
          <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-4">
            <div className="flex items-stretch justify-around gap-1">
              <InlineStat label="받은 좋아요" emoji="❤️" value={myStats.likes_received} />
              <InlineStat label="받은 댓글" emoji="💬" value={myStats.comments_received} />
              <InlineStat label="받은 공유" emoji="🔗" value={myStats.shares_received} />
              <span
                className="mx-1 self-stretch border-l border-dashed border-[var(--border)]"
                aria-hidden
              />
              <InlineStat label="누른 좋아요" emoji="🤍" value={myStats.likes_given} muted />
              <InlineStat label="작성 댓글" emoji="💭" value={myStats.comments_given} muted />
            </div>
          </div>
        </>
      )}

      {/* 본인 활동 — 모든 로그인 사용자 노출 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityList
          title="내 글"
          emoji="📝"
          empty="아직 작성한 글이 없어요"
          rows={myPosts}
          linkOf={linkOf}
          typeLabel={typeLabel}
        />
        <ActivityList
          title="좋아요한 글"
          emoji="❤️"
          empty="좋아요한 글이 없어요"
          rows={likedQas}
          linkOf={linkOf}
          typeLabel={typeLabel}
        />
        <ActivityList
          title="댓글 단 글"
          emoji="💬"
          empty="댓글 단 글이 없어요"
          rows={commentedQas}
          linkOf={linkOf}
          typeLabel={typeLabel}
        />
      </div>

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

      {/* 로그아웃 — 본인 정보 페이지 하단 */}
      <div className="mt-10 flex justify-end border-t border-[var(--border)] pt-6">
        <LogoutButton />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// 작은 컴포넌트
// ────────────────────────────────────────────────────────────

type ActivityListRow = {
  id: number;
  question: string;
  type: "qa" | "post" | "article";
  article_slug: string | null;
  created_at: string;
  doctor: { name: string } | null;
};

function ActivityList({
  title,
  emoji,
  empty,
  rows,
  linkOf,
  typeLabel,
}: {
  title: string;
  emoji: string;
  empty: string;
  rows: ActivityListRow[];
  linkOf: (r: ActivityListRow) => string;
  typeLabel: (t: ActivityListRow["type"]) => string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
        <span>{emoji}</span>
        <span>{title}</span>
        <span className="ml-auto text-xs font-normal text-[var(--text-muted)]">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--text-muted)]">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={linkOf(r)}
                className="group block rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--bg-soft)]/60"
              >
                <div className="flex items-baseline gap-1.5 text-xs text-[var(--text-muted)]">
                  <span className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] font-medium">
                    {typeLabel(r.type)}
                  </span>
                  {r.doctor?.name && (
                    <span className="truncate">{r.doctor.name} 원장님</span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-1 text-sm text-[var(--text)] group-hover:text-[var(--primary)]">
                  {r.question}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatBig({
  label,
  emoji,
  value,
  sub,
  subLevel,
  suffix,
}: {
  label: string;
  emoji: string;
  value: number;
  sub?: string;
  subLevel?: UserLevel;
  suffix?: string;
}) {
  const subColor =
    subLevel !== undefined
      ? LEVEL_COLORS[subLevel] ?? LEVEL_COLORS[0]
      : null;
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
        {suffix ?? ""}
      </div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      {sub && (
        <div
          className="mt-0.5 text-[11px] font-medium"
          style={subColor ? { color: subColor.fg } : undefined}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * InlineStat — 박스 없이 inline 표기. 큰 숫자 + 작은 라벨.
 * `muted=true`면 회색 톤 (내가 남긴 흔적 — 받은 인정과 시각 구분)
 */
function InlineStat({
  label,
  emoji,
  value,
  muted = false,
}: {
  label: string;
  emoji: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-[60px] flex-col items-center text-center">
      <div className="text-base leading-none">{emoji}</div>
      <div
        className={
          "mt-1 text-2xl font-extrabold tabular-nums leading-none " +
          (muted ? "text-[var(--text-secondary)]" : "text-[var(--text)]")
        }
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

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
