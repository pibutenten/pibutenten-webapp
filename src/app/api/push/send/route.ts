/**
 * POST /api/push/send
 *
 * Supabase Database Webhook 수신용 — notifications INSERT 발생 시 호출됨.
 * 운영 설정 (Supabase Dashboard → Database → Webhooks):
 *  - Table: public.notifications
 *  - Events: Insert
 *  - URL: https://pibutenten.kr/api/push/send  (도메인 이전 전: https://pbtt.kr/... — A-2 전환 시 Dashboard 에서 재설정)
 *  - Method: POST
 *  - HTTP Headers: x-pibutenten-push-secret = $PUSH_WEBHOOK_SECRET
 *
 * 보안: Authorization 헤더의 webhook secret 검증.
 * 알림 1건 생성 시 해당 recipient_id의 push_subscriptions 전체에 web-push 발송.
 * 만료된 구독(410 Gone)은 자동 삭제.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/error-response";
import webpush from "web-push";
import { timingSafeEqual } from "crypto";
import { getFcmMessaging } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // web-push는 Edge runtime 미지원

// 환경변수 초기화 — 모듈 1회 로드
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:pibutenten@gmail.com";
const WEBHOOK_SECRET = process.env.PUSH_WEBHOOK_SECRET ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

type WebhookPayload = {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  record?: {
    id?: number;
    recipient_id?: string;
    kind?: string;
    message?: string;
    url?: string;
  };
};

/**
 * 시크릿 timing-safe 비교 — 길이 다를 때도 안전.
 * (Phase 5-5: 단순 `!==` 는 첫 글자 mismatch 시간을 leak.)
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // 길이 정보도 노출 X 위해 동일 길이 버퍼로 비교 후 false 반환
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  // 인증 — webhook secret 검증 (timing-safe)
  const sentSecret = req.headers.get("x-pibutenten-push-secret") ?? "";
  if (!WEBHOOK_SECRET || !safeEqual(sentSecret, WEBHOOK_SECRET)) {
    return errorResponse(null, "forbidden", "[push/send] webhook secret mismatch", 403);
  }

  // VAPID 미설정이어도 즉시 종료하지 않는다 — 네이티브(FCM)는 VAPID 와 무관하게 발송돼야 한다.
  //   web 발송 루프에서 VAPID 가용 여부를 가드한다(아래 webVapidOk).
  const webVapidOk = !!(VAPID_PUBLIC && VAPID_PRIVATE);

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[push/send] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }

  // INSERT 이벤트만 처리
  if (body.type !== "INSERT" || body.table !== "notifications" || !body.record) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const { recipient_id, kind, message, url } = body.record;
  if (!recipient_id || !message) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // service_role 클라이언트 — RLS bypass, push_subscriptions 전체 조회
  const sb = createSupabaseAdminClient();

  // 구독 전체 조회 후 platform 으로 분리.
  //   web        → web-push(VAPID), p256dh/auth 사용.
  //   ios/android → FCM(firebase-admin), endpoint 자리에 FCM 토큰. p256dh/auth 는 NULL.
  const { data: allSubs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, platform")
    .eq("profile_id", recipient_id);

  if (!allSubs || allSubs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const subs = allSubs.filter((s) => s.platform === "web");
  const nativeSubs = allSubs.filter(
    (s) => s.platform === "ios" || s.platform === "android",
  );

  const KIND_TITLES: Record<string, string> = {
    comment: "💬 새 댓글",
    reply: "↳ 새 답글",
    like: "❤ 좋아요",
    save: "🔖 새 저장",
    review_request: "🩺 검수 요청",
    published: "🚀 발행 완료",
    report: "🚩 새 신고 접수",
    keyword: "🏷️ 관심 주제 새 글",
  };
  const title = (kind && KIND_TITLES[kind]) || "피부텐텐";

  const payload = JSON.stringify({
    title,
    body: message,
    url: url || "/notifications",
    tag: kind === "like" && body.record.id ? `like-${body.record.id}` : undefined,
  });

  // 병렬 발송 + 만료 구독 정리
  const expiredIds: number[] = [];
  // STEP F (0240): 410/404(만료) 외 발송 실패 영속 로깅. 발송·삭제 동작은 미변경(순수 가산).
  const failures: {
    recipient_id: string | null;
    endpoint: string | null;
    status: number | null;
    error: string;
  }[] = [];
  // web 발송 — VAPID 키가 있을 때만(없으면 web 건너뜀, FCM 은 아래에서 독립 발송).
  const results =
    webVapidOk && subs.length > 0
      ? await Promise.allSettled(
          subs.map((s) =>
            webpush.sendNotification(
              {
                endpoint: s.endpoint as string,
                keys: { p256dh: s.p256dh as string, auth: s.auth as string },
              },
              payload,
            ),
          ),
        )
      : [];
  results.forEach((r, idx) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number; message?: string };
      // 410 Gone / 404 — 만료된 구독 (기존 동작: 삭제). 로깅 대상 아님.
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredIds.push(subs[idx].id as number);
      } else {
        // 그 외 rejected (500 · payload too large · 기타 non-2xx · 네트워크) → 관측용 로깅.
        failures.push({
          recipient_id: recipient_id ?? null,
          endpoint: (subs[idx].endpoint as string | null) ?? null,
          status: typeof err.statusCode === "number" ? err.statusCode : null,
          error: (err.message ?? String(r.reason)).slice(0, 1000),
        });
      }
    }
  });
  if (expiredIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", expiredIds);
  }

  // ===== 네이티브(ios/android) FCM 발송 =====
  //   서비스계정 키(FIREBASE_SERVICE_ACCOUNT) 미설정 시 messaging=null → 건너뜀(웹 푸시는 정상).
  //   만료/무효 토큰은 web 과 동일하게 자동 삭제, 그 외 실패는 push_send_failures 로깅.
  let fcmSent = 0;
  const fcmExpiredIds: number[] = [];
  if (nativeSubs.length > 0) {
    const messaging = getFcmMessaging();
    if (messaging) {
      const tokens = nativeSubs.map((s) => s.endpoint as string);
      try {
        const resp = await messaging.sendEachForMulticast({
          tokens,
          notification: { title, body: message },
          data: { url: url || "/notifications" },
          apns: { payload: { aps: { sound: "default" } } },
        });
        fcmSent = resp.successCount;
        resp.responses.forEach((r, idx) => {
          if (r.success) return;
          const code = r.error?.code ?? "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument"
          ) {
            fcmExpiredIds.push(nativeSubs[idx].id as number);
          } else {
            failures.push({
              recipient_id: recipient_id ?? null,
              endpoint: (nativeSubs[idx].endpoint as string | null) ?? null,
              status: null,
              error: (r.error?.message ?? code).slice(0, 1000),
            });
          }
        });
      } catch (e) {
        failures.push({
          recipient_id: recipient_id ?? null,
          endpoint: null,
          status: null,
          error: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
        });
      }
    }
  }
  if (fcmExpiredIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", fcmExpiredIds);
  }

  // 발송 실패 best-effort 로깅 — 로깅 자체가 실패해도 발송 응답을 깨지 않는다.
  if (failures.length > 0) {
    try {
      const { error: logErr } = await sb
        .from("push_send_failures")
        .insert(failures);
      if (logErr) {
        console.error("[push/send] failure logging insert error:", logErr.message);
      }
    } catch (e) {
      console.error(
        "[push/send] failure logging threw:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.status === "fulfilled").length + fcmSent,
    expired: expiredIds.length + fcmExpiredIds.length,
    failed: failures.length,
  });
}
