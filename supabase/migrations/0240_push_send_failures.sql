-- 0240_push_send_failures.sql
-- 2026-06-06 — 푸시 발송 실패 영속 로깅 (4-2 STEP F).
--
-- 배경(STEP A 진단):
--   /api/push/send 는 구독별 webpush 발송 후 410/404(만료)만 구독 삭제하고,
--   그 외 rejected(500·payload too large·기타 non-2xx·네트워크)는 조용히 무시 → 적재 0.
--   push_webhook_errors 는 DB 트리거의 net.http_post 예외·secret 누락만 포착(pg_net 비동기라
--   HTTP non-2xx 미포착). 결과: 실제 발송 실패율 미관측.
--
-- 변경:
--   push_send_failures 테이블 신설(순수 가산). 삭제 로직(410/404)·발송 동작은 코드에서 미변경.
--   접근 권한은 운영 로그 push_webhook_errors 와 동일 수준 — service_role 기록 + admin 조회.
--   신규 user_id 컬럼 금지(ADR 0014) → recipient_id 사용.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_send_failures (
  id           bigserial PRIMARY KEY,
  recipient_id uuid,                              -- 알림 수신자 profile.id (nullable)
  endpoint     text,                              -- 실패한 push 구독 endpoint
  status       integer,                           -- webpush 응답 statusCode (없으면 NULL)
  error        text,                              -- 에러 메시지
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_send_failures_created_idx
  ON public.push_send_failures(created_at DESC);

ALTER TABLE public.push_send_failures ENABLE ROW LEVEL SECURITY;

-- 조회 RLS: admin 만 (push_webhook_errors 와 동일 정책). 단 authenticated 에 SELECT GRANT 를
-- 주지 않으므로 이 정책은 향후 admin 직접 조회 경로 추가 시를 위한 것(현재는 service_role 경유).
DROP POLICY IF EXISTS "push_send_failures_admin_select" ON public.push_send_failures;
CREATE POLICY "push_send_failures_admin_select" ON public.push_send_failures
  FOR SELECT USING (public.is_admin());

-- 권한: 서버(service_role)만 기록·조회. Management API(postgres owner) 로 만든 테이블은
-- service_role 에 DML 이 자동 부여되지 않으므로(default privileges) 명시 GRANT 필요.
-- anon/authenticated 는 GRANT 미부여 = 직접 접근 차단(privilege 레벨, RLS 보다 강한 차단).
GRANT SELECT, INSERT ON public.push_send_failures TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_send_failures_id_seq TO service_role;

COMMIT;

SELECT 'OK 0240' AS status;
