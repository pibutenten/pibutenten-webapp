import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import AdminView from "./AdminView";

/**
 * /admin — 관리자 전용 대시보드.
 *
 * 원칙: 상단바·배경은 앱 셸(AppShell), 본문 큰 틀은 기존 운영 대시보드 유지(AdminView).
 *   데이터·로직·RPC·운영 클라 컴포넌트는 100% 재사용.
 *   - 가드(requireAdminPage)·prefetch(통계 8개·리서치 패널·활동 KPI·검색어·태그·OAuth)는 정본.
 *   - active 가 doctor 면 본인 대시보드 /doctor 로 redirect.
 *
 * 영구 noindex. 운영 통계 + 모더레이션 + 회원 관리 + 검색어/태그 인기도 + AEO/GEO log.
 */
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

  // 운영 통계 + 6개 기간 검색어/태그 + 6개 기간 활동 KPI 일괄 prefetch.
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
    // 카드 KPI 5종 — 반드시 .is("deleted_at", null) 포함(2026-07-04 원장 제보 정정):
    //   soft_delete_card(0162)는 status 를 보존한 채 deleted_at 만 세팅하고, admin RLS 는
    //   삭제 행도 SELECT 되므로 이 필터가 없으면 KPI(예: 검수대기 6)가 클릭 목록
    //   /admin/cards(deleted_at IS NULL 강제, 3건)와 어긋난다. 축도 목록 링크(?type=)와
    //   동일하게 type 으로 통일(구 category 축은 잠재 불일치 — 실측상 값 변화 없음).
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "qa")
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "post")
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "review")
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("type", "review_summary")
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .is("deleted_at", null),
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
    <AdminView
      isSuperAdmin={isSuperAdmin}
      stats={{
        userCount: userCount ?? 0,
        doctorCount: doctorCount ?? 0,
        qaPublished: qaPublished ?? 0,
        postPublished: postPublished ?? 0,
        reviewPublished: reviewPublished ?? 0,
        reportPublished: reportPublished ?? 0,
        pendingReview: pendingReview ?? 0,
        totalComments: totalComments ?? 0,
      }}
      research={research}
      oauthHealth={oauthHealth}
      kpiByDays={kpiByDays}
      searchesByDays={searchesByDays}
      tagsByDays={tagsByDays}
    />
  );
}
