import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveIdentity } from "@/lib/identity-server";
import { ROLES } from "@/lib/identity-shared";
import { type DoctorKpi } from "./DoctorActivityKpis";
import DoctorDashboardView from "./DoctorDashboardView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "원장 대시보드",
  robots: { index: false, follow: false },
};

// admin/page.tsx 와 동일 기간 세트
const PERIOD_DAYS = [1, 7, 30, 90, 365, 0];

type SearchRow = { query: string; cnt: number };
type TagRow = { keyword: string; cnt: number };

/**
 * /doctor — 원장 본인 전용 대시보드 (2026-05-22 v3 — admin 톤 통일).
 *
 * 구조 (admin 과 동일 패턴):
 *   1) 본인 글 KPI (DoctorActivityKpis) — 조회수·댓글·저장·공유·내 글·검수 대기
 *      각 카드 클릭 → 관련 페이지로 이동 (doctor admin 자동 강제 필터링)
 *   2) 운영 프로그램 (Tool) — 본인 한정: 전체 글 관리·검수 대기·프로필 편집
 *   3) 인기 검색어 / 인기 태그 — 사이트 전체 (admin 과 동일 컴포넌트 재사용)
 *
 * 가드: 비로그인 → /login, doctor_accounts 매핑 없으면 → /admin (admin) or /
 * Q&A 추출(/admin/draft) 은 admin 전용 — doctor Tool 에 노출 X
 */
export default async function DoctorDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/doctor");

  const active = await resolveActiveIdentity(supabase, user.id, user.email);
  if (!active?.doctorId) {
    if (active?.role === ROLES.ADMIN) redirect("/admin");
    redirect("/");
  }

  // doctor 정보 lookup
  const { data: doctorRow } = await supabase
    .from("doctors")
    .select("slug, name")
    .eq("id", active.doctorId)
    .maybeSingle();
  const doctorSlug = (doctorRow as { slug: string } | null)?.slug ?? "";
  const doctorName =
    (doctorRow as { name: string } | null)?.name ?? active.displayName;

  // 모든 기간 KPI 일괄 prefetch + 인기 검색어/태그
  const [kpiResults, searchResults, tagResults] = await Promise.all([
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_doctor_kpi", {
          p_doctor_id: active.doctorId,
          p_profile_id: active.profileId,
          p_days: d,
        }),
      ),
    ),
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_top_search_queries", {
          p_days: d || 36500,
          p_limit: 10,
        }),
      ),
    ),
    Promise.all(
      PERIOD_DAYS.map((d) =>
        supabase.rpc("get_top_tags", {
          p_days: d,
          p_min_count: 1,
          p_limit: 10,
        }),
      ),
    ),
  ]);

  const EMPTY_KPI: DoctorKpi = {
    views_received: 0,
    comments_received: 0,
    saves_received: 0,
    shares_received: 0,
    published_total: 0,
    pending_review: 0,
  };
  const kpiByDays: Record<number, DoctorKpi> = {};
  PERIOD_DAYS.forEach((d, i) => {
    const rows = kpiResults[i]?.data;
    const row = Array.isArray(rows) ? rows[0] : rows;
    kpiByDays[d] = row
      ? {
          views_received: Number(row.views_received ?? 0),
          comments_received: Number(row.comments_received ?? 0),
          saves_received: Number(row.saves_received ?? 0),
          shares_received: Number(row.shares_received ?? 0),
          published_total: Number(row.published_total ?? 0),
          pending_review: Number(row.pending_review ?? 0),
        }
      : EMPTY_KPI;
  });

  const searchesByDays: Record<number, SearchRow[]> = {};
  PERIOD_DAYS.forEach((d, i) => {
    searchesByDays[d] = (searchResults[i]?.data ?? []) as SearchRow[];
  });
  const tagsByDays: Record<number, TagRow[]> = {};
  PERIOD_DAYS.forEach((d, i) => {
    tagsByDays[d] = ((tagResults[i]?.data ?? []) as TagRow[]).slice(0, 10);
  });

  const pendingCount = kpiByDays[0]?.pending_review ?? 0;

  // 본문은 운영 형태 그대로 유지하되 베타 셸(wide)로 감싸 렌더(BetaAdminView 선례 동일).
  //   데이터·권한 가드·통계 가공은 위 server 로직이 100% 책임, 표시만 View 에 위임.
  return (
    <DoctorDashboardView
      doctorName={doctorName}
      doctorSlug={doctorSlug}
      pendingCount={pendingCount}
      kpiByDays={kpiByDays}
      searchesByDays={searchesByDays}
      tagsByDays={tagsByDays}
    />
  );
}
