/**
 * POST /api/push/subscribe
 * body: { endpoint, keys: { p256dh, auth } }
 *
 * Web Push 구독 정보 저장 — 본인 profile에 묶음.
 * 같은 (profile_id, endpoint) 있으면 UPDATE (last_used_at 갱신).
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bundleProfileFilter } from "@/lib/identity-shared";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PushSubscriptionBody;
  try {
    body = (await req.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  const p256dh =
    body.keys && typeof body.keys.p256dh === "string" ? body.keys.p256dh : null;
  const auth =
    body.keys && typeof body.keys.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint and keys required" },
      { status: 400 },
    );
  }

  // Phase 9 묶음 — 본인 묶음 내 첫 profile.id에 저장
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .or(bundleProfileFilter(user.id))
    .limit(1);
  const profileId = profiles?.[0]?.id;
  if (!profileId) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  const userAgent = req.headers.get("user-agent") ?? null;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: profileId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,endpoint" },
    );

  if (error) {
    return errorResponse(error, "save_failed", "[push/subscribe] upsert", 500);
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
