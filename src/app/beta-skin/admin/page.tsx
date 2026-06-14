import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import BetaAdminView from "./BetaAdminView";

/**
 * /beta-skin/admin — 베타 스킨 관리자 대시보드 (Phase 3 ①).
 *
 * 원칙: UI 는 베타 스킨 톤, 데이터·로직·RPC·운영 클라 컴포넌트는 운영 /admin 과 100% 동일하게 재사용.
 *   - 가드(requireAdminPage)·prefetch(통계 8개·리서치 패널·활동 KPI·검색어·태그·OAuth)는 운영 page.tsx 복제.
 *   - 화면별 베타 이식은 다음 단계 → Stat/Tool 카드의 링크는 운영 /admin/* 그대로 유지.
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)이 글로벌 크롬을 덮음.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 관리자",
  robots: { index: false, follow: false },
};

// 기간 토글 6종 통일 — 24시간/7일/30일/90일/1년/전체 (운영 page.tsx 와 동일).
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

export default async function BetaAdminPage() {
  // 운영 /admin 과 동일 가드 — active 단위 권한 판정(ADR 0012).
  const guard = await requireAdminPage("/beta-skin/admin");

  // active 가 doctor 면 본인 대시보드로(운영 /admin 동일 — 베타 원장 대시보드는 다음 단계라 운영 /doctor).
  if (guard.active?.role === ROLES.DOCTOR && guard.activeDoctorId) {
    redirect("/doctor");
  }

  const supabase = await createSupabaseServerClient();
  const isSuperAdmin = guard.isSuperAdmin;

  // 운영 통계 + 6개 기간 검색어/태그 + 6개 기간 활동 KPI 일괄 prefetch(운영 page.tsx 동일).
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

  // 리서치 패널 (F-2B) — 사람(번들) 기준 집계. read-only RPC get_research_panel(운영 동일).
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

  // YouTube OAuth 상태 — 카드 라벨 동적 표시용(운영 동일).
  const oauthHealth = await checkOauthHealth();

  // 검색어 / 태그 — Record<days, rows> 맵 변환(운영 동일).
  const searchesByDays: Record<number, SearchRow[]> = {};
  SEARCH_TAG_DAYS.forEach((d, i) => {
    searchesByDays[d] = (searchResults[i]?.data ?? []) as SearchRow[];
  });
  const tagsByDays: Record<number, TagRow[]> = {};
  SEARCH_TAG_DAYS.forEach((d, i) => {
    tagsByDays[d] = ((tagResults[i]?.data ?? []) as TagRow[]).slice(0, 30);
  });

  // 활동 KPI — Record<days, Kpi> 맵 변환(운영 동일).
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
    <BetaAdminView
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
