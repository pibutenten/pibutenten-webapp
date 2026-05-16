-- 0097: youtube_oauth_tokens 테이블 신설
-- 결정 (2026-05-16): OAuth refresh_token을 .env.local 평문 + HTML 노출 → DB로 이전.
--
-- 보안 개선:
--   - callback HTML에서 refresh_token 평문 출력 제거 (이전: <pre>token=...</pre> 노출됨)
--   - service_role 키로만 select/upsert (admin RPC 또는 server-only route)
--   - RLS: anon/authenticated 모두 차단 (정책 정의 X = deny by default)
--
-- 모델:
--   현재 사이트는 admin 본인 채널 한 개만 사용 → singleton row (provider PK).
--   향후 multi-channel 필요 시 (provider, account_id) composite PK로 확장.

BEGIN;

CREATE TABLE IF NOT EXISTS public.youtube_oauth_tokens (
  provider      text PRIMARY KEY DEFAULT 'google-youtube',
  client_id     text,
  refresh_token text NOT NULL,
  scope         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- 정책 정의 0 → anon/authenticated 모두 차단 (service_role만 통과).
-- callback route + youtube-oauth.ts 가 service_role client(supabase/admin.ts)로 접근.

COMMIT;

SELECT 'OK 0097' AS status;
