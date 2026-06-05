/**
 * PATCH /api/admin/reports/[id]
 *
 * 모더레이션 액션 처리 (배치 ④, 2026-05-28).
 *
 * Body: { action: "hide" | "delete" | "dismiss", note?: string }
 *  - "hide"   — 대상 카드/댓글 status='hidden' (영구·복구가능). 30일 임시조치 폐기.
 *  - "delete" — 카드 한정: soft-delete + anonymize. ADR 0002.
 *               (댓글의 영구삭제는 별 흐름이 없어 'hide' 권장. 추후 확장 시 별도.)
 *  - "dismiss" — 신고 기각 (대상 변경 없음, status='dismissed').
 *
 * 권한: requireAdmin (active 신분 admin only, ADR 0012).
 * 부수: audit_logs 적재 (action 'moderation.{hide|delete|dismiss}').
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    action: z.enum(["hide", "delete", "dismiss"]),
    note: z.string().max(1000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-reports-patch",
    userId: guard.userId,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { id: idRaw } = await params;
  const reportId = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return errorResponse(null, "invalid_input", "[admin/reports PATCH] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 신고 ID",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/reports PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[admin/reports PATCH] zod", 400, undefined, {
      userMessage: "action 은 hide / delete / dismiss 중 하나여야 합니다.",
    });
  }
  const { action, note } = parsed.data;

  const admin = createSupabaseAdminClient();
  // 카드 모더레이션 RPC(toggle_card_hide / soft_delete_card)는 SECURITY DEFINER 본문
  // 첫 줄에서 auth.uid() 를 읽어 NULL 이면 'unauthenticated' 예외를 던진다(0162).
  // service_role(admin) 클라이언트는 사용자 세션이 없어 auth.uid()=NULL → 항상 실패.
  // 따라서 카드 RPC 는 운영자 세션 클라이언트로 호출한다(requireAdmin 통과 = active admin 명함,
  // x-active-profile-id 헤더로 is_admin(uid) 통과). 댓글 hide·신고 갱신은 admin 직접 UPDATE 유지.
  const session = await createSupabaseServerClient();

  // 신고 조회 — 대상 식별.
  const { data: report, error: fetchErr } = await admin
    .from("content_reports")
    .select("id, card_id, comment_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (fetchErr) {
    return errorResponse(fetchErr, "generic", "[admin/reports PATCH] fetch", 500);
  }
  if (!report) {
    return errorResponse(null, "not_found", "[admin/reports PATCH] not found", 404, undefined, {
      userMessage: "신고를 찾을 수 없습니다.",
    });
  }

  const targetCardId = (report as { card_id?: number | null }).card_id ?? null;
  const targetCommentId =
    (report as { comment_id?: number | null }).comment_id ?? null;

  // 액션 실행
  if (action === "hide") {
    if (targetCardId) {
      // 카드 숨김 — toggle_card_hide RPC 재사용 (0162). 세션 클라이언트(운영자 인증) 사용.
      const { error: hideErr } = await session.rpc("toggle_card_hide", {
        p_card_id: targetCardId,
        p_next_status: "hidden",
      });
      if (hideErr) {
        return errorResponse(hideErr, "save_failed", "[admin/reports PATCH] toggle_card_hide", 500);
      }
    } else if (targetCommentId) {
      // 댓글 숨김 — status='hidden' 직접 UPDATE (service_role).
      const { error: updErr } = await admin
        .from("comments")
        .update({ status: "hidden" })
        .eq("id", targetCommentId);
      if (updErr) {
        return errorResponse(updErr, "save_failed", "[admin/reports PATCH] comments hide", 500);
      }
    } else {
      return errorResponse(null, "invalid_input", "[admin/reports PATCH] no target", 400, undefined, {
        userMessage: "신고에 카드/댓글 대상이 없습니다.",
      });
    }
  } else if (action === "delete") {
    if (!targetCardId) {
      return errorResponse(null, "invalid_input", "[admin/reports PATCH] delete card-only", 400, undefined, {
        userMessage: "완전삭제는 카드 대상만 지원합니다. 댓글은 '숨김'을 사용하세요.",
      });
    }
    const { error: delErr } = await session.rpc("soft_delete_card", {
      p_card_id: targetCardId,
    });
    if (delErr) {
      return errorResponse(delErr, "save_failed", "[admin/reports PATCH] soft_delete_card", 500);
    }
  }
  // dismiss 는 신고 상태만 변경, 대상 변경 없음.

  // 신고 상태 갱신 — 운영 추적용.
  const nextReportStatus =
    action === "hide"
      ? "resolved_hidden"
      : action === "delete"
        ? "resolved_deleted"
        : "dismissed";
  const { error: updReportErr } = await admin
    .from("content_reports")
    .update({
      status: nextReportStatus,
      action_taken: action,
      resolution_note: note ?? null,
      resolved_at: new Date().toISOString(),
      resolved_by: guard.activeProfileId,
    })
    .eq("id", reportId);
  if (updReportErr) {
    return errorResponse(updReportErr, "save_failed", "[admin/reports PATCH] update", 500);
  }

  // PIPA 안전성 확보조치 §8: 모더레이션 행위 audit.
  await logAudit({
    action: `moderation.${action}`,
    actorProfileId: guard.activeProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "content_reports",
    targetId: reportId,
    request: req,
    metadata: {
      cardId: targetCardId,
      commentId: targetCommentId,
      note: note ?? null,
      nextReportStatus,
    },
  });

  return NextResponse.json({ ok: true, reportId, status: nextReportStatus });
}
