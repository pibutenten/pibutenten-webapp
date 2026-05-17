-- 0120: Push webhook secret 로테이션 (A2, 2026-05-17)
--
-- 배경:
--   0086_push_webhook_trigger.sql:25 와 0103_push_webhook_vault.sql:24 둘 다
--   secret 평문을 SQL 리터럴로 박아 git history 에 영구 노출.
--   SECURITY.md 에는 0086 만 기록되어 있고 0103 누락.
--
-- 이번 마이그레이션 정책:
--   - SQL 본문에 secret 평문 절대 X.
--   - Vault 갱신은 운영자가 Supabase Dashboard SQL Editor 에서 **수동 1회 실행**.
--     (CLI 자동 push 흐름에 secret 노출 위험이 있으므로 자동화 안 함.)
--   - 본 마이그레이션은 가드 헬퍼만 정의 + 시크릿 존재 검증.
--
-- ────────────────────────────────────────────────────────────────────────
-- 운영자 절차 (1회 수동, 본 마이그레이션 적용 후 Dashboard SQL Editor 에서):
-- ────────────────────────────────────────────────────────────────────────
--
--   1. 신규 시크릿 발급:
--        python -c "import secrets; print(secrets.token_urlsafe(48))"
--
--   2. Supabase Dashboard → SQL Editor → 새 쿼리:
--
--      SELECT public.rotate_push_webhook_secret('<신규시크릿>');
--
--      (위 함수가 vault.update_secret 호출)
--
--   3. Vercel Production env var 갱신 (Vercel Dashboard 또는 CLI):
--        vercel env add PUSH_WEBHOOK_SECRET production
--        (값에 위 신규 시크릿 입력)
--
--   4. Vercel 재배포 (env 적용).
--
--   5. 검증:
--        SELECT public.push_webhook_secret_status();
--      → { has_secret: true, vault_set_at: ..., length_ok: true }
--
--   6. 본 SQL Editor 의 쿼리 히스토리 즉시 삭제 (Supabase 가 보존하므로).
--      Supabase Dashboard → SQL Editor → History → 해당 쿼리 delete.
--
-- ────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 헬퍼: rotate_push_webhook_secret
-- ─────────────────────────────────────────────────────────────────
-- 운영자가 신규 시크릿을 파라미터로 전달 → vault 갱신.
-- SECURITY DEFINER 로 vault 접근.
-- service_role 만 EXECUTE 가능 (anon/authenticated 차단).

CREATE OR REPLACE FUNCTION public.rotate_push_webhook_secret(p_new_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_id uuid;
  v_len int;
BEGIN
  -- 길이 검증: token_urlsafe(48) = base64url 64자.
  v_len := length(p_new_secret);
  IF v_len < 40 THEN
    RAISE EXCEPTION 'secret too short: % bytes (need >= 40)', v_len
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'push_webhook_secret';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(
      p_new_secret,
      'push_webhook_secret',
      'Push notification webhook shared secret — rotated via rotate_push_webhook_secret()'
    );
  ELSE
    PERFORM vault.update_secret(
      v_existing_id,
      p_new_secret,
      'push_webhook_secret',
      'Push notification webhook shared secret — rotated via rotate_push_webhook_secret()'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'length', v_len,
    'rotated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_push_webhook_secret(text)
  FROM PUBLIC, anon, authenticated;
-- service_role 만 호출 가능 (Supabase Dashboard SQL Editor 는 service_role 권한).
-- (GRANT 안 함 — postgres/owner 권한만 통과.)

-- ─────────────────────────────────────────────────────────────────
-- 헬퍼: push_webhook_secret_status — 운영 점검용
-- ─────────────────────────────────────────────────────────────────
-- secret 의 실제 값은 노출 안 함, 존재 여부와 길이 OK 여부만 반환.

CREATE OR REPLACE FUNCTION public.push_webhook_secret_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
  v_created timestamptz;
BEGIN
  -- admin 만 호출 가능
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'push_webhook_secret'
   LIMIT 1;

  SELECT created_at INTO v_created
    FROM vault.secrets
   WHERE name = 'push_webhook_secret'
   LIMIT 1;

  RETURN jsonb_build_object(
    'has_secret', v_secret IS NOT NULL,
    'length_ok', v_secret IS NOT NULL AND length(v_secret) >= 40,
    'vault_set_at', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.push_webhook_secret_status()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_webhook_secret_status() TO authenticated;
-- 함수 본문에 is_admin() 가드 있어 일반 사용자 호출 시 자동 차단.

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- 마이그레이션 적용 후 다음 단계 (필수):
--   1. 위 "운영자 절차" 6단계 수행 → 시크릿 실제 로테이션.
--   2. SECURITY.md 에 0103 노출 이력 추가 + 정책 명문화.
--   3. 이전 시크릿 폐기 확인 — push 알림 1회 정상 수신 검증.
-- ────────────────────────────────────────────────────────────────────────
