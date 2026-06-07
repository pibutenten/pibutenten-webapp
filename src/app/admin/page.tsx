import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import { PopularSearchesCard, PopularTagsCard } from "./PopularCards";
import ActivityKpis from "./ActivityKpis";
import LogoutButton from "@/components/LogoutButton";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 대시보드",
  robots: { index: false, follow: false },
};

// 기간 토글 6종 통일 — 24시간/7일/30일/90일/1년/전체 (사이트 전체 동일)
const PERIOD_DAYS = [1, 7, 30, 90, 365, 0] as const;
const SEARCH_TAG_DAYS = PERIOD_DAYS;
const ACTIVITY_DAYS = PERIOD_DAYS;

type SearchRow = { query: string; cnt: number };
type TagRow = { keyword: string; cnt: number };
type KpiRow = {
  visitors: number;
  new_members: number;
  views: number;
  new_cards: number;
  comments: number;
  likes: number;
  saves: number;
  shares: number;
};

/**
 * /admin — 관리자 전용 대시보드 (v4 spec).
 * 영구 noindex. 운영 통계 + 모더레이션 + 회원 관리 + 검색어/태그 인기도 + AEO/GEO log.
 */
export default async function AdminPage() {
  // PRD §C — 묶음 OR 가드. 묶음 안에 admin role profile 1개라도 있으면 super admin,
  // 또는 active 가 doctor + doctor_accounts 매핑이면 doctor admin. 그 외 차단.
  const guard = await requireAdminPage("/admin");

  // 2026-05-22: active 가 doctor 면 본인 대시보드 /doctor 로 보냄 (안전망).
  // IdentitySwitcher 가 doctor → /doctor 로 보내지만 직접 URL 입력 케이스 차단.
  if (guard.active?.role === ROLES.DOCTOR && guard.activeDoctorId) {
    redirect("/doctor");
  }

  const supabase = await createSupabaseServerClient();
  const isSuperAdmin = guard.isSuperAdmin;

  // 운영 통계 + 6개 기간 검색어/태그 + 5개 기간 활동 KPI 일괄 prefetch.
  // 모든 기간을 미리 받아두면 클릭 시 깜빡임 없이 즉시 스위치.
  const [
    { count: userCount },
    { count: doctorCount },
    { count: qaPublished },
    { count: postPublished },
    { count: reviewPublished },
    { count: reportPublished },
    { count: pendingReview },
    { count: totalComments },
    searchResults,
    tagResults,
    kpiResults,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "doctor"),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "qa")
      .eq("status", "published"),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "post")
      .eq("status", "published"),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("category", "review")
      .eq("status", "published"),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("category", "review_summary")
      .eq("status", "published"),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible"),
    Promise.all(
      SEARCH_TAG_DAYS.map((d) =>
        supabase.rpc("get_top_search_queries", { p_days: d || 36500, p_limit: 30 })
      )
    ),
    Promise.all(
      SEARCH_TAG_DAYS.map((d) =>
        supabase.rpc("get_top_tags", { p_days: d, p_min_count: 1, p_limit: 30 })
      )
    ),
    Promise.all(
      ACTIVITY_DAYS.map((d) => supabase.rpc("get_admin_kpi", { p_days: d }))
    ),
  ]);

  // 리서치 패널 (F-2B) — 사람(번들) 기준 집계. read-only RPC get_research_panel.
  //   total_members(탈퇴 제외)·active_90d(최근 90일 site_visits)·reviewers(후기 작성).
  //   상단 "회원" 카드(명함 row 수)와 달리 distinct auth_user_id 기준 → 숫자 다를 수 있음.
  const { data: researchRows } = await supabase.rpc("get_research_panel");
  const researchRow = (Array.isArray(researchRows)
    ? researchRows[0]
    : researchRows) as
    | { total_members: number; active_90d: number; reviewers: number }
    | null
    | undefined;
  const research = {
    totalMembers: Number(researchRow?.total_members ?? 0),
    active90d: Number(researchRow?.active_90d ?? 0),
    reviewers: Number(researchRow?.reviewers ?? 0),
  };

  // YouTube OAuth 상태 — 카드 라벨 동적 표시용
  const oauthHealth = await checkOauthHealth();

  // 검색어 / 태그 — Record<days, rows> 맵 변환
  const searchesByDays: Record<number, SearchRow[]> = {};
  SEARCH_TAG_DAYS.forEach((d, i) => {
    searchesByDays[d] = (searchResults[i]?.data ?? []) as SearchRow[];
  });
  const tagsByDays: Record<number, TagRow[]> = {};
  SEARCH_TAG_DAYS.forEach((d, i) => {
    tagsByDays[d] = ((tagResults[i]?.data ?? []) as TagRow[]).slice(0, 30);
  });

  // 활동 KPI — Record<days, Kpi> 맵 변환 (RPC가 set returning 또는 single row 모두 지원)
  const kpiByDays: Record<number, KpiRow> = {};
  const EMPTY_KPI: KpiRow = {
    visitors: 0,
    new_members: 0,
    views: 0,
    new_cards: 0,
    comments: 0,
    likes: 0,
    saves: 0,
    shares: 0,
  };
  ACTIVITY_DAYS.forEach((d, i) => {
    const rows = kpiResults[i]?.data;
    const row = Array.isArray(rows) ? rows[0] : rows;
    kpiByDays[d] = row
      ? {
          visitors: Number(row.visitors ?? 0),
          new_members: Number(row.new_members ?? 0),
          views: Number(row.views ?? 0),
          new_cards: Number(row.new_cards ?? 0),
          comments: Number(row.comments ?? 0),
          likes: Number(row.likes ?? 0),
          saves: Number(row.saves ?? 0),
          shares: Number(row.shares ?? 0),
        }
      : EMPTY_KPI;
  });

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">관리자 대시보드</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          운영 통계·모더레이션·회원 관리 (영구 noindex)
        </p>
      </div>

      {/* 운영 통계 — 누적 카드 8개. 모바일 4개씩 (2줄), 데스크탑 8개 한 줄.
          순서: 회원·원장·Q&A·끄적끄적·시술후기·시술 리포트·검수 대기·댓글. */}
      <div className="mb-6 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        <Stat label="회원" value={userCount ?? 0} href="/admin/users" />
        <Stat label="원장" value={doctorCount ?? 0} href="/admin/doctors" />
        <Stat label="Q&A" value={qaPublished ?? 0} href="/admin/cards?type=qa&status=published" />
        <Stat label="끄적끄적" value={postPublished ?? 0} href="/admin/cards?type=post&status=published" />
        <Stat label="시술후기" value={reviewPublished ?? 0} href="/admin/cards?type=review&status=published" />
        <Stat label="시술 리포트" value={reportPublished ?? 0} href="/admin/cards?type=review_summary&status=published" />
        <Stat
          label="검수 대기"
          value={pendingReview ?? 0}
          highlight={(pendingReview ?? 0) > 0}
          href="/admin/cards?status=pending_review"
        />
        <Stat label="댓글" value={totalComments ?? 0} href="/admin/comments" />
      </div>

      {/* 리서치 패널 (F-2B) — 사람(번들) 기준 집계. 상단 "회원"(명함 row)과 기준 다름. */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
          리서치 패널{" "}
          <span className="font-normal text-[var(--text-muted)]">
            (사람 기준 · 같은 사람의 여러 명함은 1명으로 집계)
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat
            label="총 가입자"
            value={research.totalMembers}
            title="탈퇴 제외 · 사람 기준(distinct 가입 계정). 상단 '회원'은 명함 수 기준이라 다를 수 있습니다."
          />
          <Stat
            label="활성 회원 (90일)"
            value={research.active90d}
            title="최근 90일 방문 기준(site_visits) · 사람 기준. site_visits 적재 시작(2026-05-23) 이후라 윈도가 점차 채워집니다."
          />
          <Stat
            label="후기 작성 회원"
            value={research.reviewers}
            title="시술 후기(procedure_reviews) 작성자 · 사람 기준(distinct 가입 계정)."
          />
        </div>
      </div>

      {/* 활동 KPI (기간 토글) — 방문자/조회수/댓글/좋아요/저장/공유. 모든 기간 prefetch. */}
      <ActivityKpis initialDays={1} dataByDays={kpiByDays} />

      {/* 운영 프로그램 — 액션·관리 도구 (KPI/통계와 구분). PR-OPS (2026-05-19) 명명 정리. */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
          운영 프로그램
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Tool
            href="/admin/cards"
            emoji="📚"
            title="전체 글 관리"
            desc="Q&A·끄적끄적 검색·필터·발행/보관"
          />
          {/* 태그 관리 — tag_dictionary 인라인 편집 (super admin 전용) */}
          {isSuperAdmin && (
            <Tool
              href="/admin/tags"
              emoji="🏷"
              title="태그 관리"
              desc="태그 분류·영문·부모·시술·온보딩 인라인 편집 + 병합"
            />
          )}
          {/* 시술 리포트 전용 요약 표 (읽기 전용) — 시술별 후기·재시술·만족도·통증·engagement */}
          <Tool
            href="/admin/review-reports"
            emoji="📊"
            title="시술 리포트"
            desc="시술별 후기 집계 요약 (후기수·재시술·만족도·통증·조회/저장/공유)"
          />
          {/* 새 Q&A 추출하기 — super admin 전용 (원장 계정엔 숨김) */}
          {isSuperAdmin && (
            <Tool
              href="/admin/draft"
              emoji="📝"
              title="새 Q&A 추출하기"
              desc="소스에서 Q&A 카드를 추출하여 검수를 보냅니다"
            />
          )}
          {/* 새 Q&A 카드 직접 작성 — 기존 /write?category=qa 재사용 (admin/doctor 노출) */}
          <Tool
            href="/write?category=qa"
            emoji="📝"
            title="Q&A 카드 작성하기"
            desc="원장 명의 Q&A 카드를 직접 작성합니다"
          />
          {/* 검수 대기 — 모든 admin 노출 (원장 계정에선 본인 doctor 카드만 보임) */}
          <Tool
            href="/admin/cards?status=pending_review"
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
          {/* 배치 ④ (2026-05-28): 신고 검토 큐 (영구 숨김/완전삭제 액션) */}
          {isSuperAdmin && (
            <Tool
              href="/admin/reports"
              emoji="🚩"
              title="신고 검토"
              desc="회원 신고 큐 — 숨김(영구·복구가능) / 완전삭제(익명화)"
            />
          )}
          <Tool
            href="/admin/doctors"
            emoji="🩺"
            title="의사 프로필 관리"
            desc="학력·경력·전문분야 등 확장 프로필"
          />
          {/* PR-OPS (2026-05-19): OAuth 콜백 에러 운영 추적기 — super admin 만 */}
          {isSuperAdmin && (
            <Tool
              href="/admin/auth-errors"
              emoji="🪪"
              title="회원가입 에러 로그"
              desc="Google·Kakao·Naver 콜백 에러 (PII 마스킹)"
            />
          )}
          <Tool
            prefetch={false}
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

      {/* 인기 검색어·태그 — 모든 기간 prefetch → 클릭 시 즉시 스위치 (깜빡임 0). */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PopularSearchesCard initialDays={1} dataByDays={searchesByDays} />
        <PopularTagsCard initialDays={0} dataByDays={tagsByDays} />
      </div>

      {/* 본인 대시보드 최하단 로그아웃 — admin/doctor/user 공통 패턴 */}
      <div className="mt-12 flex justify-center border-t border-[var(--border)] pt-6">
        <LogoutButton />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  href,
  title,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
  /** hover 툴팁 (집계 기준 설명 등). */
  title?: string;
}) {
  const cls =
    "block overflow-hidden rounded-[var(--radius)] border bg-white p-3 transition-colors " +
    (highlight
      ? "border-amber-300 hover:bg-amber-50/40"
      : "border-[var(--border)] hover:bg-[var(--bg-soft)]");
  const inner = (
    <>
      <div className="whitespace-nowrap text-[11px] leading-tight text-[var(--text-muted)]">
        {label}
      </div>
      {/* 1000+ 4~6자리에도 칸 넘치지 않게 — 모바일은 한 단계 작게 + nowrap. */}
      <div
        className={
          "mt-1 whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl " +
          (highlight ? "text-amber-700" : "text-[var(--text)]")
        }
      >
        {value.toLocaleString()}
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} title={title}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} title={title}>
      {inner}
    </div>
  );
}

function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
  prefetch,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
  /** API endpoint나 사이드 이펙트 있는 라우트는 prefetch={false} 권장 */
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
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
