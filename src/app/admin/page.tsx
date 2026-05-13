import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";
import { getIdentityContext } from "@/lib/identity";
import { PopularSearchesCard, PopularTagsCard } from "./PopularCards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 대시보드",
  robots: { index: false, follow: false },
};

const PERIOD_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7일", days: 7 },
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

/**
 * /admin — 관리자 전용 대시보드 (v4 spec).
 * 영구 noindex. 운영 통계 + 모더레이션 + 회원 관리 + 검색어/태그 인기도 + AEO/GEO log.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ searches?: string; tags?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const searchesDays = parseInt(sp.searches ?? "7", 10) || 7;
  const tagsDays = parseInt(sp.tags ?? "0", 10) || 0;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  // 권한 분기 — active identity 기반 (cookie 'pibutenten:identity')
  //   active.kind='admin'     → super admin (개발자/관리자, 모든 권한 + 새 Q&A 추출하기 노출)
  //   active.doctor_id !=NULL → 원장 admin (본인 doctor 카드만 + 새 Q&A 추출하기 숨김)
  //   active.kind='user'      → admin 권한 없음 → 일반 사용자처럼 차단
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin)) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }
  const isSuperAdmin = idCtx.isSuperAdmin;

  // 운영 통계 — 회원·글·댓글 카운트 + 인기 검색어·태그
  const [
    { count: userCount },
    { count: doctorCount },
    { count: qaPublished },
    { count: postPublished },
    { count: pendingReview },
    { count: totalComments },
    topSearchRes,
    topTagsRes,
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
    supabase.rpc("get_top_search_queries", { p_days: searchesDays || 36500, p_limit: 10 }),
    supabase.rpc("get_top_tags", { p_days: tagsDays, p_min_count: 1, p_limit: 10 }),
  ]);

  // YouTube OAuth 상태 — 카드 라벨 동적 표시용
  const oauthHealth = await checkOauthHealth();
  const topSearches = (topSearchRes.data ?? []) as Array<{
    query: string;
    cnt: number;
  }>;
  const topTags = ((topTagsRes.data ?? []) as Array<{
    keyword: string;
    cnt: number;
  }>).slice(0, 10);

  return (
    <section className="w-full py-6">
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">관리자 대시보드</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          운영 통계·모더레이션·회원 관리 (영구 noindex)
        </p>
      </div>

      {/* 운영 통계 — 카드 6개. 클릭 시 해당 메뉴로 이동.
          모바일 3개씩 (2줄), 데스크탑 6개 한 줄. */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        <Stat label="전체 회원" value={userCount ?? 0} href="/admin/users" />
        <Stat label="원장" value={doctorCount ?? 0} href="/admin/users?role=doctor" />
        <Stat label="발행 Q&A" value={qaPublished ?? 0} href="/admin/qas?type=qa&status=published" />
        <Stat label="발행 포스팅" value={postPublished ?? 0} href="/admin/qas?type=post&status=published" />
        <Stat
          label="검수 대기"
          value={pendingReview ?? 0}
          highlight={(pendingReview ?? 0) > 0}
          href="/admin/qas?status=pending_review"
        />
        <Stat label="댓글" value={totalComments ?? 0} href="/admin/qas?has=comments" />
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
          {/* 새 Q&A 추출하기 — super admin 전용 (원장 계정엔 숨김) */}
          {isSuperAdmin && (
            <Tool
              href="/admin/draft"
              emoji="📝"
              title="새 Q&A 추출하기"
              desc="YouTube 영상 → AI Q&A 카드 추출 → PubMed 참고문헌 매칭 → 원장 검수 보냄"
            />
          )}
          {/* 검수 대기 — 모든 admin 노출 (원장 계정에선 본인 doctor 카드만 보임) */}
          <Tool
            href="/admin/qas?status=pending_review"
            emoji="⏳"
            title="검수 대기"
            desc={
              (pendingReview ?? 0) > 0
                ? `${pendingReview}개 검수 대기 중 →`
                : "검수 후 발행 대기"
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
          <Tool
            href="/api/admin/youtube-oauth/start"
            emoji={
              oauthHealth.state === "ok"
                ? "✅"
                : oauthHealth.state === "expired"
                ? "⚠"
                : oauthHealth.state === "error"
                ? "⚠"
                : "🔑"
            }
            title={
              oauthHealth.state === "ok"
                ? "YouTube 자막 OAuth (연동 중)"
                : oauthHealth.state === "expired"
                ? "YouTube 자막 OAuth (재인증 필요)"
                : oauthHealth.state === "error"
                ? "YouTube 자막 OAuth (오류)"
                : "YouTube 자막 OAuth 연동"
            }
            desc={
              oauthHealth.state === "ok"
                ? "본인 채널 영상 자막 자동 fetch 작동 중. 클릭하면 다른 계정으로 재인증."
                : oauthHealth.state === "expired"
                ? "토큰 만료(테스트 모드 7일). 클릭 → 5초 내 재인증 → 자동 갱신."
                : oauthHealth.state === "error"
                ? `오류: ${oauthHealth.detail.slice(0, 60)} — 클릭해 재인증.`
                : "피부텐텐 본인 채널 영상 자막 자동 fetch (1회 설정)"
            }
            highlight={
              oauthHealth.state === "expired" || oauthHealth.state === "error"
            }
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

      {/* 인기 검색어·태그 — client 컴포넌트 (기간 토글이 카드만 갱신) */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PopularSearchesCard initialDays={searchesDays} initialData={topSearches} />
        <PopularTagsCard initialDays={tagsDays} initialData={topTags} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
}) {
  const cls =
    "block rounded-[var(--radius)] border bg-white p-4 transition-colors " +
    (highlight
      ? "border-amber-300 hover:bg-amber-50/40"
      : "border-[var(--border)] hover:bg-[var(--bg-soft)]");
  const inner = (
    <>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div
        className={
          "mt-1 text-2xl font-bold tabular-nums " +
          (highlight ? "text-amber-700" : "text-[var(--text)]")
        }
      >
        {value.toLocaleString()}
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
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
