-- 0103_push_webhook_vault.sql
-- Phase 5-5 (2026-05-16): push webhook secret 을 Supabase Vault 로 이관 + 신규 시크릿 로테이션.
--
-- 배경:
--   0086_push_webhook_trigger.sql 본문에 secret 이 하드코딩되어 git history 에 영구 노출.
--   기존 시크릿 'MUfWMCnu...' 은 즉시 폐기.
--
-- 새 시크릿 생성 절차:
--   1) python -c "import secrets; print(secrets.token_urlsafe(48))" 로 신규 발급
--   2) vault.create_secret() 으로 DB Vault 에 저장
--   3) trigger 함수가 vault.decrypted_secrets 에서 동적 read
--   4) Vercel Production env var PUSH_WEBHOOK_SECRET 도 같은 값으로 업데이트 (별도 작업)
--
-- 보안:
--   - vault.decrypted_secrets 는 service_role 만 접근 가능 (anon/authenticated 차단).
--   - SECURITY DEFINER 트리거가 service_role 권한으로 시크릿 read.

-- ─────────────────────────────────────────────────────────────────
-- 1) 새 시크릿 vault 에 저장 — IDEMPOTENT (이미 있으면 update)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_existing_id uuid;
  v_new_secret text := '73qpLpercXjzz4Ezdk0ESoc_7390lTYI8AGgFn5qyn1SGC6VBkLhkMYbyBJhK2cs';
BEGIN
  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'push_webhook_secret';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(
      v_new_secret,
      'push_webhook_secret',
      'Push notification webhook shared secret — used by trigger -> /api/push/send'
    );
  ELSE
    PERFORM vault.update_secret(
      v_existing_id,
      v_new_secret,
      'push_webhook_secret',
      'Push notification webhook shared secret — used by trigger -> /api/push/send'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2) Push webhook trigger 함수 재정의 — Vault 동적 read
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notifications_push_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url text := 'https://pbtt.kr/api/push/send';
  v_secret text;
  v_payload jsonb;
BEGIN
  -- Vault 에서 동적 read — 시크릿 로테이션 시 함수 재정의 불필요
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    -- vault 미설정 시 warning + skip (장애 회피)
    RAISE WARNING '[push_webhook] push_webhook_secret missing in vault — skipping';
    RETURN NEW;
  END IF;

  -- Supabase Database Webhook 과 동일 payload 포맷
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

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pibutenten-push-secret', v_secret
      ),
      body := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- HTTP 실패는 알림 INSERT 를 막지 않음 (best effort) — warning 만 남김
    RAISE WARNING '[push_webhook] http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 권한: trigger 는 owner 권한으로 동작 — 별도 GRANT 불필요.
