-- 0234: get_users_auth_info — 관리자 회원관리용 provider/email 조회 (작업 C, 2026-06-04)
--
-- PostgREST 는 auth 스키마를 직접 못 읽으므로, 관리자 회원관리 목록에서 회원별
-- 간편로그인 provider(구글/카카오/네이버/이메일) + 로그인 이메일을 보이려면
-- SECURITY DEFINER RPC 가 필요하다. read-only, admin/service_role 전용(PIPA enumeration 차단).
--
-- 묶음(의사 다명함) 매핑: 한 profile 의 auth user 는
--   p.id 가 auth.users 에 있으면 그 자신(base), 아니면 p.auth_user_id(번들 secondary).
-- providers 는 그 auth user 의 auth.identities provider 목록(DISTINCT).
-- email 은 auth 로그인 이메일(중복 계정 식별에 가장 권위 있는 값).

CREATE OR REPLACE FUNCTION public.get_users_auth_info(p_profile_ids uuid[])
RETURNS TABLE(profile_id uuid, auth_user_id uuid, email text, providers text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id AS profile_id,
         au.id AS auth_user_id,
         au.email::text AS email,
         COALESCE(
           array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
           ARRAY[]::text[]
         ) AS providers
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT u.* FROM auth.users u
    WHERE u.id = p.id OR u.id = p.auth_user_id
    ORDER BY (u.id = p.id) DESC  -- base(자기 자신) 우선, 없으면 번들 owner
    LIMIT 1
  ) au ON true
  LEFT JOIN auth.identities i ON i.user_id = au.id
  WHERE p.id = ANY(p_profile_ids)
  GROUP BY p.id, au.id, au.email;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_users_auth_info(uuid[]) TO authenticated, service_role;
