-- 0133: Naver OAuth callback 의 auth.users / auth.identities 조회를 RPC 로 격리
--
-- 배경 (2026-05-19):
--   Naver OAuth 검수 통과 후 production 적용 시 callback 에서 `auth_failed` 에러 발생.
--   원인: `admin.schema("auth" as never).from("users")` 형태로 PostgREST 통해 auth
--         스키마 직접 조회 → Supabase 가 기본적으로 auth 스키마를 외부 API 로 노출하지
--         않아 "Invalid schema: auth" 응답.
--
--   1차 점검(260517) 외부 검토자가 짚었던 `as never` type assertion 위험이 실제로 터진 케이스.
--
-- 해결:
--   SECURITY DEFINER RPC 하나로 auth.users 조회 + identities provider 목록을 한번에 반환.
--   service_role 만 호출 가능 (anon/authenticated REVOKE).
--   service_role 은 RLS·GRANT 무시이지만 명시적 REVOKE 로 회귀 방지.
--
-- 호출 위치:
--   src/app/api/auth/naver/callback/route.ts — 2곳의 .schema("auth")... 호출 대체.

CREATE OR REPLACE FUNCTION public.find_auth_user_by_email_with_providers(
  p_email text
)
RETURNS TABLE (
  user_id uuid,
  providers text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 빈 입력 방어
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    COALESCE(
      array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
      ARRAY[]::text[]
    ) AS providers
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  GROUP BY u.id
  LIMIT 1;
END;
$$;

-- 권한 정리: service_role 만 호출. anon / authenticated 차단.
REVOKE ALL ON FUNCTION public.find_auth_user_by_email_with_providers(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email_with_providers(text)
  TO service_role;

COMMENT ON FUNCTION public.find_auth_user_by_email_with_providers(text) IS
  '[0133] Naver OAuth callback 의 auth.users + auth.identities 조회용 service_role 전용 RPC. '
  'PostgREST 가 auth 스키마를 노출하지 않으므로 SECURITY DEFINER 로 우회. '
  'email 정규화(lower + trim) 후 매칭. providers 배열은 distinct, NULL 제외.';
