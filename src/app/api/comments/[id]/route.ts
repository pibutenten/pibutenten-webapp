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
  if (id == null) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let raw: PatchBody;
  try {
    raw = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: { body?: string; status?: "visible" | "hidden" | "deleted" } = {};

  if (typeof raw.body === "string") {
    const b = raw.body.trim();
    if (!b) return NextResponse.json({ error: "body is empty" }, { status: 400 });
    if (b.length > 2000)
      return NextResponse.json({ error: "댓글은 2000자 이내로 작성해주세요." }, { status: 400 });
    update.body = b;
  }
  if (typeof raw.status === "string") {
    if (!ALLOWED_STATUS.has(raw.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    update.status = raw.status as "visible" | "hidden" | "deleted";
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
    return NextResponse.json({ error: "권한이 없거나 댓글을 찾을 수 없습니다." }, { status: 403 });
  }

  return NextResponse.json({ comment: upd.data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (id == null) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
    return NextResponse.json({ error: "권한이 없거나 댓글을 찾을 수 없습니다." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
