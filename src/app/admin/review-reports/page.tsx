import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import AdminReviewReportsView, {
  type ReviewOverviewRow,
} from "./AdminReviewReportsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술 리포트",
  robots: { index: false, follow: false },
};

/**
 * /admin/review-reports — 운영자 전용 '시술 리포트' 요약 표 (읽기 전용, 앱 셸 적용 Phase 3 ②).
 *
 * 데이터: get_review_report_overview() RPC (0238, admin 전용 SECURITY DEFINER).
 *   시술별 1행 — 후기수·재시술의향%·만족도·통증 + 조회/저장/공유(engagement).
 * 그룹핑: procedure_taxonomy.category 동적 (카테고리 늘어도 자동 반영, 하드코딩 없음).
 * 행 클릭 → /reports/{en} (공개 리포트).
 *
 * 원칙: 가드·RPC·그룹핑은 운영 그대로 유지하고, 렌더만 AdminReviewReportsView(앱 셸 래퍼)로 위임한다.
 */

type OverviewRow = ReviewOverviewRow;

export default async function AdminReviewReportsPage() {
  await requireAdminPage("/admin/review-reports");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_review_report_overview");
  const rows = ((data ?? []) as OverviewRow[]).map((r) => ({
    ...r,
    review_count: Number(r.review_count ?? 0),
    revisit_yes: Number(r.revisit_yes ?? 0),
    revisit_maybe: Number(r.revisit_maybe ?? 0),
    revisit_no: Number(r.revisit_no ?? 0),
    view_count: Number(r.view_count ?? 0),
    save_count: Number(r.save_count ?? 0),
    share_count: Number(r.share_count ?? 0),
  }));

  // 카테고리별 그룹핑 — RPC 가 category, sort_order, ko 순으로 정렬해 반환하므로 순서 보존.
  const groups: { category: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    let g = groups.find((x) => x.category === row.category);
    if (!g) {
      g = { category: row.category, rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  return (
    <AdminReviewReportsView
      groups={groups}
      rowCount={rows.length}
      errorMessage={error ? error.message : null}
    />
  );
}
