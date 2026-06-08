-- ============================================================
-- 0276 로그인 RPC 2개 재정의 (2026-06-08)
--
-- 변경:
--   - 반환 컬럼명 user_id → auth_user_id (ADR 0014: auth.users.id 는 auth_user_id)
--     반환 타입 변경이라 ALTER 불가 → DROP + CREATE 필수
--   - find_other_auth_user_by_email: PUBLIC/authenticated 과잉 EXECUTE 권한 정리
--     (내부 가드는 있으나 호출 코드가 service_role admin client 만 사용 → service_role only)
--   - 본문 로직·SECURITY DEFINER 유지, search_path 에 pg_temp 추가
--
-- 적용 전제: 코드측 캐스팅 .user_id → .auth_user_id 수정 완료
--   (src/app/auth/callback/route.ts, src/app/api/auth/naver/callback/route.ts)
-- 의존 DB 객체(다른 함수/뷰/트리거) 0건 확인 → DROP 안전.
-- ============================================================

DROP FUNCTION IF EXISTS public.find_auth_user_by_email_with_providers(text);
DROP FUNCTION IF EXISTS public.find_other_auth_user_by_email(text, uuid);

-- ── find_auth_user_by_email_with_providers ──────────────────
CREATE FUNCTION public.find_auth_user_by_email_with_providers(p_email text)
  RETURNS TABLE(auth_user_id uuid, providers text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'service_role or admin only' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT u.id AS auth_user_id,
    COALESCE(array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL), ARRAY[]::text[]) AS providers
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  GROUP BY u.id
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_auth_user_by_email_with_providers(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_auth_user_by_email_with_providers(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.find_auth_user_by_email_with_providers(text) TO service_role;

-- ── find_other_auth_user_by_email ────────────────────────────
CREATE FUNCTION public.find_other_auth_user_by_email(p_email text, p_exclude_user_id uuid)
  RETURNS TABLE(auth_user_id uuid, providers text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'service_role or admin only' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT u.id AS auth_user_id,
    COALESCE(array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL), ARRAY[]::text[]) AS providers
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND u.id <> p_exclude_user_id
  GROUP BY u.id
  ORDER BY u.created_at ASC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_other_auth_user_by_email(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_other_auth_user_by_email(text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.find_other_auth_user_by_email(text, uuid) TO service_role;
