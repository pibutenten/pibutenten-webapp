-- 0086: notifications INSERT → /api/push/send 호출 trigger (pg_net 기반)
--
-- Supabase Dashboard의 Database Webhooks 기능 대체.
-- pg_net extension(0.20.0)이 활성화된 상태에서 직접 trigger로 HTTP POST 발송.
--
-- 발송 흐름:
--   1) notifications INSERT (댓글/좋아요/궁금해요 등)
--   2) 본 trigger가 net.http_post 호출
--   3) /api/push/send 가 webhook secret 검증 후 web-push 발송
--   4) 사용자 폰 잠금화면에 알림 표시
--
-- 보안: x-pibutenten-push-secret 헤더로 인증.
-- 비동기: pg_net이 background queue로 처리 — DB 트랜잭션과 분리, 실패해도 INSERT는 유지.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notifications_push_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://pbtt.kr/api/push/send';
  v_secret text := 'MUfWMCnutoE4sBp4EGVcyUiPRWfNybXFy-qd3uHsiOY';
  v_payload jsonb;
BEGIN
  -- Supabase Database Webhook과 동일 payload 포맷
  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'notifications',
    'schema', 'public',
    'record', jsonb_build_object(
      'id', NEW.id,
      'recipient_id', NEW.recipient_id,
      'kind', NEW.kind,
      'actor_id', NEW.actor_id,
      'card_id', NEW.card_id,
      'comment_id', NEW.comment_id,
      'message', NEW.message,
      'url', NEW.url,
      'read_at', NEW.read_at,
      'created_at', NEW.created_at
    )
  );

  PERFORM extensions.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pibutenten-push-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- HTTP 실패 시에도 INSERT는 유지 (web-push 발송은 알림 보존보다 부차)
  RAISE WARNING 'notifications_push_webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push_webhook ON public.notifications;
CREATE TRIGGER trg_notifications_push_webhook
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notifications_push_webhook();

SELECT 'OK 0086' AS status;
