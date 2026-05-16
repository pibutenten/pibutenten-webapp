-- 0105_rate_limit_and_push_errors.sql
-- Phase 5-8 (2026-05-16): DB 기반 rate limit + push webhook 에러 로깅.
--
-- 1) api_rate_limits 테이블 + check_and_increment_rate_limit() 헬퍼:
--    - sliding window 가 아닌 단순 fixed window counter (구현 단순화)
--    - Upstash Redis 가 free plan 에 없어 DB 자체로 충분히 처리
--    - find_duplicate_profiles 에 즉시 적용
--
-- 2) push_webhook_errors 테이블 + notifications_push_webhook 트리거 강화:
--    - 기존: EXCEPTION WHEN OTHERS → 단순 RAISE WARNING (운영자 미관측)
--    - 변경: 별도 에러 로그 table 에 적재 → 관리자 대시보드에서 모니터링 가능

-- ─────────────────────────────────────────────────────────────────
-- 1) Rate limit 인프라
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key   text NOT NULL,           -- e.g., "find_duplicate_profiles:<user_id>"
  window_start timestamptz NOT NULL,    -- 현재 윈도우 시작 시각
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- 오래된 윈도우 정리용 인덱스
CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx
  ON public.api_rate_limits(window_start);

-- 헬퍼: window_seconds 동안 max_count 까지 허용. 초과 시 false 반환.
-- 호출자는 false 받으면 즉시 abort.
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_bucket_key text,
  p_max_count integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_current_count integer;
BEGIN
  -- 윈도우 시작 시각 = 현재 시각을 window_seconds 로 floor.
  v_window_start := date_trunc('seconds', now())
                  - (EXTRACT(EPOCH FROM date_trunc('seconds', now()))::bigint
                     % p_window_seconds) * INTERVAL '1 second';

  -- upsert: 동일 (bucket, window) 가 있으면 count +1, 없으면 1 로 insert.
  INSERT INTO public.api_rate_limits (bucket_key, window_start, count)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET count = public.api_rate_limits.count + 1
  RETURNING count INTO v_current_count;

  RETURN v_current_count <= p_max_count;
END;
$$;

-- find_duplicate_profiles 에 rate limit 적용 (사용자당 60초에 10회).
-- 0102 의 정의를 그대로 두고 wrapping 하기 어렵기 때문에 함수 본문 재정의.
DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);

CREATE FUNCTION public.find_duplicate_profiles(
  p_legal_name text,
  p_birthdate date,
  p_gender text
)
RETURNS TABLE(match_count int, providers text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  -- Phase 5-8: rate limit — 사용자당 60초에 10회 (정상 사용은 1~2회로 충분)
  v_rate_ok := public.check_and_increment_rate_limit(
    'find_duplicate_profiles:' || v_user_id::text,
    10,
    60
  );
  IF NOT v_rate_ok THEN
    RAISE EXCEPTION 'rate limit exceeded — try again in a minute' USING ERRCODE = '54000';
  END IF;

  IF p_legal_name IS NULL OR length(trim(p_legal_name)) = 0
     OR p_birthdate IS NULL OR p_gender IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::int AS match_count,
    COALESCE(
      array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
      ARRAY[]::text[]
    ) AS providers
  FROM public.profiles p
  LEFT JOIN auth.identities i ON i.user_id = p.auth_user_id
  WHERE p.legal_name = trim(p_legal_name)
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) Push webhook 에러 로그
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_webhook_errors (
  id             bigserial PRIMARY KEY,
  notification_id bigint,
  error_message  text NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_webhook_errors_occurred_idx
  ON public.push_webhook_errors(occurred_at DESC);

-- RLS: admin 만 조회 가능. service_role bypass.
ALTER TABLE public.push_webhook_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_webhook_errors_admin_select" ON public.push_webhook_errors;
CREATE POLICY "push_webhook_errors_admin_select" ON public.push_webhook_errors
  FOR SELECT TO authenticated
  USING (is_admin());

-- 트리거 함수 재정의 — 에러 발생 시 별도 table 에 INSERT (silent X)
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
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    INSERT INTO public.push_webhook_errors (notification_id, error_message)
    VALUES (NEW.id, 'push_webhook_secret missing in vault');
    RETURN NEW;
  END IF;

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
    -- 알림 INSERT 자체는 차단하지 X (best effort). 에러는 운영 가시성 위해 별도 table.
    BEGIN
      INSERT INTO public.push_webhook_errors (notification_id, error_message)
      VALUES (NEW.id, format('http_post failed: %s', SQLERRM));
    EXCEPTION WHEN OTHERS THEN
      -- 로깅도 실패하면 그냥 무시 (cascade 방지)
      RAISE WARNING '[push_webhook] both http_post and error log failed';
    END;
  END;

  RETURN NEW;
END;
$$;
