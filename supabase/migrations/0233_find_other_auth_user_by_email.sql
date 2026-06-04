-- 0233: find_other_auth_user_by_email — 동일 이메일 '다른 계정' 조회 (작업 b)
--
-- 표준 OAuth callback(Google/Kakao)은 신규 auth_user 가 이미 생성된 뒤 실행되므로,
-- 기존 find_auth_user_by_email_with_providers(LIMIT 1, 현재 사용자 미제외)로는
-- 자기 자신을 반환할 수 있어 충돌 감지에 부적합. 현재 user 를 제외하고 같은 이메일의
-- '다른' 계정 + 그 provider 목록을 반환한다(있으면 충돌).
--
-- read-only. SECURITY DEFINER + service_role/admin 전용(PIPA enumeration 차단).
-- find_auth_user_by_email_with_providers 와 동일 가드.

CREATE OR REPLACE FUNCTION public.find_other_auth_user_by_email(
  p_email text,
  p_exclude_user_id uuid
)
 RETURNS TABLE(user_id uuid, providers text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'service_role or admin only' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT u.id AS user_id,
    COALESCE(array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL), ARRAY[]::text[]) AS providers
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND u.id <> p_exclude_user_id
  GROUP BY u.id
  ORDER BY u.created_at ASC  -- 가장 먼저 가입한 기존 계정 우선
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_other_auth_user_by_email(text, uuid) TO service_role, authenticated;
