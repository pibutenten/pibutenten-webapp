-- 0135: auth_callback_errors — 회원가입/로그인 OAuth 콜백 에러 추적 테이블
--
-- 목적 (PR-OPS, 2026-05-19):
--   Google / Kakao / Naver / Magic-link 콜백에서 발생한 에러를 admin 운영자가
--   admin UI 한 페이지에서 확인할 수 있도록 DB 에 적재.
--   현재는 Vercel 서버 로그에만 있어 운영자가 매번 vercel CLI 로 추적해야 함.
--
-- PII 안전성:
--   - email / IP 는 저장 시점에 **마스킹된 값만** 저장 (애플리케이션 레이어가 강제).
--   - PIPA §28 안전성 확보조치 + KISA 가이드라인 접속기록 1년 보관 기준.
--   - 실제 raw 정보가 필요하면 같은 error_id 로 Vercel 서버 로그 추가 조회.
--
-- 접근 제어:
--   - RLS 활성화. admin (super or doctor admin) SELECT 만 허용.
--   - INSERT 는 service_role 만 (애플리케이션 코드의 admin client 경유).
--   - anon / authenticated 완전 차단.

CREATE TABLE IF NOT EXISTS public.auth_callback_errors (
  error_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  provider        text NOT NULL,         -- 'google' | 'kakao' | 'naver' | 'magiclink' | 'unknown'
  step            text NOT NULL,         -- 'callback' | 'code_exchange' | 'token_verify' | 'user_lookup' | 'create_user' | 'state_mismatch' | 'redirect' | ...
  error_kind      text NOT NULL,         -- STANDARD_ERROR_MESSAGES key
  error_message   text,                  -- 서버 측 상세 (admin 만 조회)
  attempted_email_masked text,           -- 마스킹 후 저장 (예: 'jm****@gmail.com')
  ip_masked       text,                  -- IPv4 마지막 옥텟 마스킹 (예: '203.0.113.***')
  user_agent      text,
  resolved_at     timestamptz,           -- 운영자가 확인·해결 처리한 시각
  resolved_note   text,                  -- 운영 메모
  CHECK (provider IN ('google','kakao','naver','magiclink','unknown')),
  CHECK (step <> ''),
  CHECK (error_kind <> '')
);

CREATE INDEX IF NOT EXISTS idx_auth_callback_errors_created_at
  ON public.auth_callback_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_callback_errors_provider
  ON public.auth_callback_errors (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_callback_errors_unresolved
  ON public.auth_callback_errors (created_at DESC)
  WHERE resolved_at IS NULL;

-- RLS
ALTER TABLE public.auth_callback_errors ENABLE ROW LEVEL SECURITY;

-- SELECT: admin (super 또는 doctor admin) 만
DROP POLICY IF EXISTS auth_callback_errors_select ON public.auth_callback_errors;
CREATE POLICY auth_callback_errors_select ON public.auth_callback_errors
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- UPDATE: admin 만 (resolved_at / resolved_note 만 변경 의도, 다만 column-level 제한은 별도 RPC 로 강제 가능)
DROP POLICY IF EXISTS auth_callback_errors_update ON public.auth_callback_errors;
CREATE POLICY auth_callback_errors_update ON public.auth_callback_errors
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- INSERT/DELETE 는 RLS 정책 없음 → 기본 DENY. service_role 만 가능.

-- 권한 GRANT 명시 (RLS 와 함께 작동)
GRANT SELECT, UPDATE ON public.auth_callback_errors TO authenticated;
REVOKE INSERT, DELETE ON public.auth_callback_errors FROM authenticated, anon;

COMMENT ON TABLE public.auth_callback_errors IS
  '[0135, PR-OPS] OAuth 콜백 에러 운영 추적용. email/IP 마스킹 후 저장. '
  'admin 만 SELECT. service_role 만 INSERT.';
