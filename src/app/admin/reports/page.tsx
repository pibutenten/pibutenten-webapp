/**
 * /admin/reports — 신고 검토 큐 (배치 ④, 2026-05-28).
 *
 * content_reports 최신순. 각 행: 대상(카드/댓글) 미리보기 + 사유 + 신고자 + 시각 + status.
 * 액션 2개 (+ 기각): [숨김] / [완전삭제] / [기각]. PATCH /api/admin/reports/[id] 호출.
 *
 * 권한: requireAdminPage superAdminOnly (active 신분 admin only, ADR 0012).
 */
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminReportsView from "./AdminReportsView";
import { REPORT_REASON_LABEL } from "@/lib/report-reasons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신고 검토 — 관리자",
  robots: { index: false, follow: false },
};

// 신고 사유 라벨은 SSOT(@/lib/report-reasons) 참조 — 화면별 표기 불일치 제거.
const REASON_LABEL: Record<string, string> = REPORT_REASON_LABEL;

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  resolved_hidden: "숨김 완료",
  resolved_deleted: "삭제 완료",
  dismissed: "기각",
  // 옛 enum 호환 (혹시 잔존)
  investigating: "검토 중",
  resolved: "처리됨",
  rejected: "기각",
  temp_blocked: "임시조치",
};

type ReportRow = {
  id: number;
  card_id: number | null;
  comment_id: number | null;
  reporter_profile_id: string | null;
  reporter_email: string | null;
  target_url: string | null;
  reason: string;
  detail: string | null;
  status: string;
  action_taken: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

type CardPreview = { id: number; title: string | null; status: string; deleted_at: string | null };
type CommentPreview = { id: number; body: string; status: string };

export default async function AdminReportsPage() {
  await requireAdminPage("/admin/reports", { superAdminOnly: true });

  const supabase = await createSupabaseServerClient();
  const { data: reports } = await supabase
    .from("content_reports")
    .select(
      "id, card_id, comment_id, reporter_profile_id, reporter_email, target_url, reason, detail, status, action_taken, resolution_note, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<ReportRow[]>();

  const rows = reports ?? [];

  // 대상 미리보기 fetch — IN 일괄.
  const cardIds = Array.from(
    new Set(rows.map((r) => r.card_id).filter((v): v is number => v !== null)),
  );
  const commentIds = Array.from(
    new Set(rows.map((r) => r.comment_id).filter((v): v is number => v !== null)),
  );

  const cardMap = new Map<number, CardPreview>();
  if (cardIds.length > 0) {
    const { data } = await supabase
      .from("cards")
      .select("id, title, status, deleted_at")
      .in("id", cardIds)
      .returns<CardPreview[]>();
    for (const c of data ?? []) cardMap.set(c.id, c);
  }

  const commentMap = new Map<number, CommentPreview>();
  if (commentIds.length > 0) {
    const { data } = await supabase
      .from("comments")
      .select("id, body, status")
      .in("id", commentIds)
      .returns<CommentPreview[]>();
    for (const c of data ?? []) commentMap.set(c.id, c);
  }

  const enriched = rows.map((r) => ({
    ...r,
    cardPreview: r.card_id ? (cardMap.get(r.card_id) ?? null) : null,
    commentPreview: r.comment_id ? (commentMap.get(r.comment_id) ?? null) : null,
  }));

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <AdminReportsView
      rows={enriched}
      reasonLabel={REASON_LABEL}
      statusLabel={STATUS_LABEL}
      pendingCount={pendingCount}
      totalCount={rows.length}
    />
  );
}

export type AdminReportRowEnriched = ReportRow & {
  cardPreview: CardPreview | null;
  commentPreview: CommentPreview | null;
};
