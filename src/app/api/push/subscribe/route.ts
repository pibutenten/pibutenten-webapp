/**
 * POST /api/push/subscribe
 * body (web):    { endpoint, keys: { p256dh, auth } }            → platform 'web'
 * body (native): { token, platform: 'ios' | 'android' }          → FCM 토큰
 *
 * 푸시 구독 정보 저장 — **active profile 한 장** 기준 (CLAUDE.md 원칙 #1).
 * 같은 (profile_id, endpoint) 있으면 UPDATE (last_used_at 갱신).
 *
 * 플랫폼 분기 (2026-06-17, 앱스토어 Phase 2):
 *  - web: 기존 Web Push(VAPID). endpoint + p256dh + auth 필수.
 *  - ios/android: Capacitor 네이티브. FCM 토큰을 endpoint 자리에 저장(p256dh/auth 없음 → NULL).
 *    발송은 send 라우트가 platform 으로 web-push / FCM 분기.
 *
 * Critical-2 (2026-05-27): 묶음의 "첫 profile" 에 저장하던 비결정적 로직 폐기.
 * 현재 active identity 의 profileId 에 명시 저장. 묶음 내 다른 profile 로 전환
 * 시 그쪽 신분으로 별도 구독 등록 (신분별 알림 분리).
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  token?: string; // 네이티브(Capacitor) FCM 등록 토큰
  platform?: string; // 'web' | 'ios' | 'android'
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx || !idCtx.active) {
    return errorResponse(null, "unauthorized", "[push/subscribe] auth required", 401);
  }

  // PR-B E6: 구독 등록 도배 방어. user 당 분당 10회 충분 (정상 사용 1~2회).
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "push-subscribe",
    userId: idCtx.user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let body: PushSubscriptionBody;
  try {
    body = (await req.json()) as PushSubscriptionBody;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[push/subscribe] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }

  // 플랫폼 판정 — 'ios'/'android' 만 네이티브, 그 외 전부 'web'.
  const platform =
    body.platform === "ios" || body.platform === "android" ? body.platform : "web";

  // endpoint / 암호화 키 결정.
  //  - web    : endpoint + p256dh + auth 전부 필수.
  //  - native : FCM 토큰을 endpoint 자리에 저장, p256dh/auth 는 없음(NULL).
  let endpoint: string | null;
  let p256dh: string | null = null;
  let auth: string | null = null;

  if (platform === "web") {
    endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
    p256dh =
      body.keys && typeof body.keys.p256dh === "string" ? body.keys.p256dh : null;
    auth = body.keys && typeof body.keys.auth === "string" ? body.keys.auth : null;
    if (!endpoint || !p256dh || !auth) {
      return errorResponse(null, "invalid_input", "[push/subscribe] endpoint/keys missing", 400, undefined, {
        userMessage: "endpoint and keys required",
      });
    }
  } else {
    const rawToken = typeof body.token === "string" ? body.token.trim() : "";
    endpoint = rawToken || null;
    if (!endpoint) {
      return errorResponse(null, "invalid_input", "[push/subscribe] native token missing", 400, undefined, {
        userMessage: "token required",
      });
    }
  }

  // 활성 신분 한 장에만 명시 저장 (CLAUDE.md 원칙 #1).
  const profileId = idCtx.active.profileId;

  const userAgent = req.headers.get("user-agent") ?? null;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: profileId,
        endpoint,
        p256dh,
        auth,
        platform,
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
