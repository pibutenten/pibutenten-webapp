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
 *   시술별 1행 — 후기수·재시술의향%·만족도·통증 + 조회/저장/공유(engagement)
 *   + 신규 4필드(anchor_created_at·sat_dist·downtime_dist·effect_top, 2026-07-04 확장).
 * 표시: 플랫 목록(카테고리 그룹 헤더 제거 — 원장 확정 2026-07-04), 기본 정렬은 View 가
 *   후기수 내림차순으로 수행. 행 클릭 → /reports/{en} (공개 리포트).
 *
 * 원칙: 가드·RPC 는 운영 그대로 유지하고, 렌더만 AdminReviewReportsView(앱 셸 래퍼)로 위임한다.
 */

/**
 * RPC 원본 행 — 신규 4필드(anchor_created_at·sat_dist·downtime_dist·effect_top)는
 * 마이그레이션 적용 전 RPC 가 반환하지 않으므로 optional/unknown 으로 받아
 * 아래에서 null·빈 배열로 정규화한다(마이그 미적용 상태에서도 페이지가 죽지 않게).
 */
type OverviewRow = Omit<
  ReviewOverviewRow,
  "anchor_created_at" | "sat_dist" | "downtime_dist" | "effect_top"
> & {
  anchor_created_at?: string | null;
  sat_dist?: unknown;
  downtime_dist?: unknown;
  effect_top?: unknown;
};

/** integer[] 정규화 — 배열이 아니면(마이그 전 undefined 포함) 빈 배열. */
function toIntArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => Number(x) || 0) : [];
}

/** effect_top jsonb 정규화 — [{label,n}] 형태만 통과, 그 외(마이그 전 undefined 포함) 빈 배열. */
function toEffectTop(v: unknown): { label: string; n: number }[] {
  if (!Array.isArray(v)) return [];
  const out: { label: string; n: number }[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") continue;
    const { label, n } = e as { label?: unknown; n?: unknown };
    if (typeof label !== "string" || !label) continue;
    out.push({ label, n: Number(n) || 0 });
  }
  return out;
}

export default async function AdminReviewReportsPage() {
  await requireAdminPage("/admin/review-reports");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_review_report_overview");
  const rows: ReviewOverviewRow[] = ((data ?? []) as OverviewRow[]).map((r) => ({
    ...r,
    review_count: Number(r.review_count ?? 0),
    revisit_yes: Number(r.revisit_yes ?? 0),
    revisit_maybe: Number(r.revisit_maybe ?? 0),
    revisit_no: Number(r.revisit_no ?? 0),
    view_count: Number(r.view_count ?? 0),
    save_count: Number(r.save_count ?? 0),
    share_count: Number(r.share_count ?? 0),
    // 신규 4필드 — 마이그 미적용 시 null/빈 배열 폴백(View 가 '—' 처리).
    anchor_created_at:
      typeof r.anchor_created_at === "string" ? r.anchor_created_at : null,
    sat_dist: toIntArray(r.sat_dist),
    downtime_dist: toIntArray(r.downtime_dist),
    effect_top: toEffectTop(r.effect_top),
  }));

  // 그룹핑 없음 — 플랫 목록(원장 확정 2026-07-04). 기본 정렬(후기수 내림차순)은 View 담당.
  return (
    <AdminReviewReportsView
      rows={rows}
      rowCount={rows.length}
      errorMessage={error ? error.message : null}
    />
  );
}
