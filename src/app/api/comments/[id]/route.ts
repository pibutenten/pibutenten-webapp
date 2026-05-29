/**
 * /api/comments/[id]
 *
 *  PATCH { body? } | { status }   본인: body / admin·doctor: status
 *  DELETE                          본인 / admin / 해당 글 doctor
 *
 * 실권한은 RLS가 강제. 여기서는 입력만 검증.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/error-response";
import { rateLimit } from "@/lib/rate-limit";
import { getIdentityContext } from "@/lib/identity";
import { logAudit } from "@/lib/audit-log";
import { screenContent } from "@/lib/content-screening";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function getId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = parseInt(id, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type PatchBody = {
  body?: unknown;
  status?: unknown;
};

const ALLOWED_STATUS = new Set(["visible", "hidden", "deleted"]);

export async function PATCH(req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (id == null) {
    return errorResponse(null, "invalid_input", "[comments PATCH] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 댓글 id",
    });
  }

  let raw: PatchBody;
  try {
    raw = (await req.json()) as PatchBody;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[comments PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }

  const update: { body?: string; status?: "visible" | "hidden" | "deleted" } = {};

  if (typeof raw.body === "string") {
    const b = raw.body.trim();
    if (!b) {
      return errorResponse(null, "invalid_input", "[comments PATCH] empty body", 400, undefined, {
        userMessage: "댓글 내용을 입력해 주세요.",
      });
    }
    if (b.length > 2000) {
      return errorResponse(null, "invalid_input", "[comments PATCH] body too long", 400, undefined, {
        userMessage: "댓글은 2000자 이내로 작성해주세요.",
      });
    }
    update.body = b;
  }
  if (typeof raw.status === "string") {
    if (!ALLOWED_STATUS.has(raw.status)) {
      return errorResponse(null, "invalid_input", "[comments PATCH] invalid status", 400, undefined, {
        userMessage: "유효하지 않은 상태값입니다.",
      });
    }
    update.status = raw.status as "visible" | "hidden" | "deleted";
  }

  if (Object.keys(update).length === 0) {
    return errorResponse(null, "invalid_input", "[comments PATCH] no fields", 400, undefined, {
      userMessage: "수정할 내용이 없습니다.",
    });
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  const user = idCtx?.user ?? null;
  if (!user) {
    return errorResponse(null, "unauthorized", "[comments PATCH] auth required", 401);
  }

  // Rate limit — mutation 도배 가드. 분당 20회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "comments-patch",
    userId: user.id,
    max: 20,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 콘텐츠 자동검수 (2026-05-28): 본인이 본문 수정 시 active 신분이 USER 면 재검사.
  // 카드의 PUT 패턴 미러링 (의사·관리자는 자동 통과). 임계 초과 시 status='hidden' + flags.
  // status 만 변경하는 admin/doctor 흐름은 검수 skip (다른 사용자의 댓글 status 조정).
  let verdictForAudit: { flagged: boolean; reasons: string[] } | null = null;
  if (typeof update.body === "string") {
    const activeRole = (idCtx?.active?.role ?? "user") as
      | "admin"
      | "doctor"
      | "user";
    const verdict = screenContent({
      title: null,
      body: update.body,
      keywords: null,
      externalUrl: null,
      authorRole: activeRole,
    });
    if (verdict.flagged) {
      update.status = "hidden";
      (update as Record<string, unknown>).screening_flags = verdict.reasons;
    } else if (activeRole === "user") {
      // 의심 해소된 수정이면 flags 정리. cards PUT 패턴과 동일.
      (update as Record<string, unknown>).screening_flags = null;
    }
    verdictForAudit = { flagged: verdict.flagged, reasons: verdict.reasons };
  }

  const upd = await supabase
    .from("comments")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (upd.error) {
    return errorResponse(upd.error, "save_failed", "[comments PATCH] update", 400);
  }
  if (!upd.data) {
    return errorResponse(null, "forbidden", "[comments PATCH] denied or not found", 403, undefined, {
      userMessage: "권한이 없거나 댓글을 찾을 수 없습니다.",
    });
  }

  // PIPA 안전성 확보조치 §8: admin/doctor 가 타인 댓글을 변경한 경우 audit.
  // status 변경은 admin/doctor 만 가능 (RLS) → 항상 audit. body 변경은 본인 일치 시 noise 라 제외.
  // 2026-05-29 (CRITICAL-1): comments 작성자 컬럼은 author_id (user_id 컬럼은 존재하지 않음).
  const ownerId = (upd.data as { author_id?: string | null } | null)?.author_id ?? null;
  const isOwn = !!idCtx?.active && ownerId === idCtx.active.profileId;
  if (update.status !== undefined || (!isOwn && update.body !== undefined)) {
    await logAudit({
      action: "comment.admin_update",
      actorProfileId: idCtx?.active?.profileId ?? null,
      actorAuthUserId: user.id,
      targetTable: "comments",
      targetId: id,
      request: req,
      metadata: {
        status: update.status ?? null,
        bodyChanged: update.body !== undefined,
        ownerProfileId: ownerId,
      },
    });
  }

  return NextResponse.json({
    comment: upd.data,
    screening: verdictForAudit?.flagged
      ? {
          status: "hidden",
          reasons: verdictForAudit.reasons,
          userMessage:
            "수정 내용이 자동 검수에서 의심 표현으로 감지되어 보류되었습니다. 운영자가 검토합니다.",
        }
      : null,
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (id == null) {
    return errorResponse(null, "invalid_input", "[comments DELETE] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 댓글 id",
    });
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  const user = idCtx?.user ?? null;
  if (!user) {
    return errorResponse(null, "unauthorized", "[comments DELETE] auth required", 401);
  }

  // Rate limit — 분당 20회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "comments-delete",
    userId: user.id,
    max: 20,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // RLS가 자체적으로 본인 / admin / 해당 doctor만 통과시킴.
  // author_id 도 함께 받아서 audit 판정 (2026-05-29 CRITICAL-1: 옛 user_id 잘못 참조 정정).
  const del = await supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id, author_id")
    .maybeSingle();

  if (del.error) {
    return errorResponse(del.error, "save_failed", "[comments DELETE] delete", 400);
  }
  if (!del.data) {
    return errorResponse(null, "forbidden", "[comments DELETE] denied or not found", 403, undefined, {
      userMessage: "권한이 없거나 댓글을 찾을 수 없습니다.",
    });
  }

  // PIPA 안전성 확보조치 §8: 타인 댓글 삭제는 audit (admin/doctor).
  // 2026-05-29 (CRITICAL-1): comments 작성자 컬럼은 author_id (user_id 컬럼은 존재하지 않음).
  const ownerId = (del.data as { author_id?: string | null } | null)?.author_id ?? null;
  const isOwn = !!idCtx?.active && ownerId === idCtx.active.profileId;
  if (!isOwn) {
    await logAudit({
      action: "comment.admin_delete",
      actorProfileId: idCtx?.active?.profileId ?? null,
      actorAuthUserId: user.id,
      targetTable: "comments",
      targetId: id,
      request: req,
      metadata: { ownerProfileId: ownerId },
    });
  }

  return NextResponse.json({ ok: true });
}
