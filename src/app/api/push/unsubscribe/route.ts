/**
 * POST /api/push/unsubscribe
 * body: { endpoint }
 *
 * 본인 push 구독 해지. endpoint로만 식별 (한 사용자가 여러 기기 구독 가능).
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let endpoint: string | null = null;
  try {
    const body = (await req.json()) as { endpoint?: string };
    if (typeof body.endpoint === "string") endpoint = body.endpoint;
  } catch (e) {
    // body 파싱 실패 — 아래 endpoint null 체크에서 400 으로 떨어지지만
    // 클라이언트가 잘못된 payload 를 보내는 회귀를 추적할 수 있도록 기록.
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      console.warn("[push-unsubscribe] body 파싱 실패:", e instanceof Error ? e.message : e);
    } else {
      console.error("[push-unsubscribe] body 파싱 실패:", e instanceof Error ? e.message : e);
    }
  }
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  // RLS가 본인 묶음만 허용하므로 endpoint 단독으로 안전
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return errorResponse(error, "save_failed", "[push/unsubscribe] delete", 500);
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
