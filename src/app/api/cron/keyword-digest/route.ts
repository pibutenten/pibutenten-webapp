import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 관심(Q&A) 알림 digest Cron — 4-2 / 3b-2.
 *
 * 호출: Vercel Cron (vercel.json crons, 21:00 UTC = 06:00 KST 매일 1회. indexnow 04:00 과 분리).
 * 인증: Authorization: Bearer ${CRON_SECRET} (indexnow 라우트와 동일).
 *   - Vercel Cron 이 자동으로 CRON_SECRET env 값을 위 헤더로 첨부.
 *   - 외부 무단 호출 차단(불일치/누락 → 401).
 *
 * 동작:
 *   - service_role 로 DB 함수 run_keyword_digest() 호출.
 *   - 함수가 직전 실행(커서) 이후 새로 발행된 qa 카드를 회원 관심사/피부고민/피부타입
 *     태그와 매칭 → (회원,태그)별 새 글 수 집계 → notifications(kind='keyword') INSERT.
 *   - 알림 INSERT 는 기존 webhook→Web Push 트리거를 그대로 타므로 푸시 자동(추가 배선 없음).
 *   - 함수 단일 트랜잭션 + 커서 FOR UPDATE → 실패 시 롤백·재시도 = 정확히 1회.
 *   - 커서 초기값 now()(마이그 0245) 라 첫 실행은 0건(과거 카드 무시·폭탄 방지).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DigestRow = { processed: number; notifications_created: number };

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("run_keyword_digest");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as DigestRow | null;
  return Response.json({
    ok: true,
    processed: row?.processed ?? 0,
    notifications_created: row?.notifications_created ?? 0,
  });
}
