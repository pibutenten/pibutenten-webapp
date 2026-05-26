-- 0164: acting_profile_id() 헬퍼 추가 (ADR 0012 정합)
--
-- 현재 RLS / RPC 의 `COALESCE(public.current_active_profile_id(), auth.uid())` 패턴이
-- 34곳에 인라인 반복. 헬퍼 1개로 추출 → 향후 fallback 정책 변경 시 1곳 수정으로 끝.
--
-- 본 마이그레이션은 **함수 추가만**. 옛 인라인 표현은 그대로 두고, 신규 RLS/RPC 작성 시
-- 본 헬퍼를 사용. 점진 마이그레이션 — production drift 0.
--
-- 적용:
--   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d @0164_acting_profile_id_helper.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.acting_profile_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
  SECURITY INVOKER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(public.current_active_profile_id(), auth.uid())
$$;

COMMENT ON FUNCTION public.acting_profile_id() IS
  'ADR 0012 정합 — current_active_profile_id() 헤더 있으면 그 값, 없으면 auth.uid(). RLS/RPC 의 권한 판정 단일 출처.';

-- 권한: authenticated 만 호출 가능. anon 차단 (RLS 측면).
REVOKE EXECUTE ON FUNCTION public.acting_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acting_profile_id() TO authenticated, service_role;

COMMIT;
