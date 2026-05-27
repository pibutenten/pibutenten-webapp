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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(null, "unauthorized", "[comments PATCH] auth required", 401);
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

  return NextResponse.json({ comment: upd.data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (id == null) {
    return errorResponse(null, "invalid_input", "[comments DELETE] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 댓글 id",
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(null, "unauthorized", "[comments DELETE] auth required", 401);
  }

  // RLS가 자체적으로 본인 / admin / 해당 doctor만 통과시킴.
  const del = await supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (del.error) {
    return errorResponse(del.error, "save_failed", "[comments DELETE] delete", 400);
  }
  if (!del.data) {
    return errorResponse(null, "forbidden", "[comments DELETE] denied or not found", 403, undefined, {
      userMessage: "권한이 없거나 댓글을 찾을 수 없습니다.",
    });
  }

  return NextResponse.json({ ok: true });
}
