import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 시술일기 리텐션 리마인더 Cron — P4 (후기·시술일기 통합). 정본 계획서 §6.4.
 *
 * 호출: Vercel Cron (vercel.json crons, 00:00 UTC = 09:00 KST 매일 1회.
 *   indexnow 04:00 / keyword-digest 06:00 과 분리된 시각).
 * 인증: Authorization: Bearer ${CRON_SECRET} (indexnow / keyword-digest 라우트와 동일).
 *   - Vercel Cron 이 자동으로 CRON_SECRET env 값을 위 헤더로 첨부.
 *   - 외부 무단 호출 차단(불일치/누락 → 401).
 *
 * 동작:
 *   - service_role 로 DB 함수 run_diary_reminders() 호출.
 *   - 함수가 scheduled_notification 의 due 행(status='pending' AND fire_after<=now())을
 *     단일 CTE 체인(locked→fired→mark_sent/mark_skip)으로 발사:
 *       · 토글 게이트(pref_review_checkin/pref_diary_incomplete) + diary_incomplete 자격 재확인 →
 *         eligible 만 notifications(kind='diary_reminder') INSERT.
 *       · sent/skipped 는 SKIP LOCKED 로 잠근 동일 id 집합에서만 분기(이중승급·미발사 sent 0).
 *   - 알림 INSERT 는 기존 trg_notifications_push_webhook → /api/push/send → Web Push/FCM 를
 *     그대로 타므로 푸시 자동(추가 발송 배선 없음).
 *   - 함수 단일 트랜잭션 + 상태행 FOR UPDATE → 동시 cron 직렬화 = 멱등.
 *
 * 현재 dormant: 예약 행을 적재하는 UI/RPC 가 아직 라이브 아님 → scheduled_notification 0행 →
 *   호출돼도 발사 0건.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReminderRow = { fired: number; skipped: number };

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("run_diary_reminders");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReminderRow | null;
  return Response.json({
    ok: true,
    fired: row?.fired ?? 0,
    skipped: row?.skipped ?? 0,
  });
}
