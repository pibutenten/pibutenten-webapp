/**
 * POST /api/push/send
 *
 * Supabase Database Webhook 수신용 — notifications INSERT 발생 시 호출됨.
 * 운영 설정 (Supabase Dashboard → Database → Webhooks):
 *  - Table: public.notifications
 *  - Events: Insert
 *  - URL: https://pbtt.kr/api/push/send
 *  - Method: POST
 *  - HTTP Headers: x-pibutenten-push-secret = $PUSH_WEBHOOK_SECRET
 *
 * 보안: Authorization 헤더의 webhook secret 검증.
 * 알림 1건 생성 시 해당 recipient_id의 push_subscriptions 전체에 web-push 발송.
 * 만료된 구독(410 Gone)은 자동 삭제.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";
import { timingSafeEqual } from "crypto";

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
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json(
      { error: "VAPID keys not configured" },
      { status: 503 },
    );
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
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

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", recipient_id);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const KIND_TITLES: Record<string, string> = {
    comment: "💬 새 댓글",
    reply: "↳ 새 답글",
    like: "❤ 좋아요",
    new_ask: "❓ 새 궁금해요",
    review_request: "🩺 검수 요청",
    published: "🚀 발행 완료",
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
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        {
          endpoint: s.endpoint as string,
          keys: { p256dh: s.p256dh as string, auth: s.auth as string },
        },
        payload,
      ),
    ),
  );
  results.forEach((r, idx) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number };
      // 410 Gone / 404 — 만료된 구독
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredIds.push(subs[idx].id as number);
      }
    }
  });
  if (expiredIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.status === "fulfilled").length,
    expired: expiredIds.length,
  });
}
