/**
 * GET /api/notifications/preferences   — 본인 알림 종류별 on/off 조회
 * POST /api/notifications/preferences  — 본인 알림 종류별 on/off 저장
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Prefs = {
  pref_comment: boolean;
  pref_reply: boolean;
  pref_like: boolean;
  pref_new_ask: boolean;
  pref_review_request: boolean;
  pref_published: boolean;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("get_my_notification_prefs");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const prefs: Prefs = {
    pref_comment: row?.pref_comment ?? true,
    pref_reply: row?.pref_reply ?? true,
    pref_like: row?.pref_like ?? true,
    pref_new_ask: row?.pref_new_ask ?? true,
    pref_review_request: row?.pref_review_request ?? true,
    pref_published: row?.pref_published ?? true,
  };
  return NextResponse.json(prefs, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<Prefs>;
  try {
    body = (await req.json()) as Partial<Prefs>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const toBool = (v: unknown, def: boolean) =>
    typeof v === "boolean" ? v : def;

  const { error } = await supabase.rpc("save_my_notification_prefs", {
    p_comment: toBool(body.pref_comment, true),
    p_reply: toBool(body.pref_reply, true),
    p_like: toBool(body.pref_like, true),
    p_new_ask: toBool(body.pref_new_ask, true),
    p_review_request: toBool(body.pref_review_request, true),
    p_published: toBool(body.pref_published, true),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
