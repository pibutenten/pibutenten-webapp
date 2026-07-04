-- 0334_pii_access_rpcs.sql
-- Phase 1-B 단계1 / H-1 (2026-07-04): profiles PII 안전 조회 RPC 2종.
--
-- 목적: 현재 authenticated 롤이 profiles PII 8컬럼(birthdate/gender/face_shape/
--   skin_type/skin_concerns/interested_procedures/contact_email/fitzpatrick) SELECT
--   권한을 갖고 profiles_public_select(qual=true)로 전 행을 통과시켜, 로그인한 아무
--   회원이나 raw REST 로 타인 PII 를 수집할 수 있다(field_visibility 는 앱 계층에서만
--   적용 = 우회 가능). 다음 단계(단계2)에서 authenticated 의 PII 컬럼 GRANT 를 REVOKE
--   하는데, 그러면 본인 PII 를 읽던 코드도 42501 로 전면 실패한다(identity-server·
--   middleware·onboarding·my·today·[handle]·admin/users·auth/callback).
--   → 본 RPC 로 조회 경로를 먼저 옮긴 뒤(단계1) REVOKE(단계2)해야 앱이 안 멈춘다.
--
-- 이 마이그(단계1)는 RPC 신설만 — GRANT 회수 없음. 적용해도 기존 동작 무영향(순수 추가).
--
-- (1) get_onboarding_gate(p_target): 온보딩 게이트 판정용 경량 RPC.
--     본인 묶음(id=auth.uid OR auth_user_id=auth.uid)일 때만 (birthdate, terms_agreed_at)
--     반환. 아니면 0행. identity-server(resolveActiveIdentity)·middleware 가 사용.
--     ※ active.birthdate 는 코드에서 오직 '설정됐는지' 불리언 게이트로만 소비되나(5개 API),
--       본인 데이터라 값 반환도 안전.
--
-- (2) get_profile_pii(p_target): PII 표시용 RPC.
--     - 본인 묶음 또는 is_admin(): 전체 PII 반환.
--     - 그 외(타인 프로필 열람): field_visibility 로 공개된 필드만(앱 ProfileView 의
--       `v[key] !== false` = 명시적 false 가 아니면 공개, 기본 공개 규약과 동일 —
--       COALESCE(...,true)). contact_email·fitzpatrick 은 field_visibility 대상이 아니라
--       타인에겐 항상 NULL.
--     onboarding·my·today·[handle](본인 settings+타인 프로필)·auth/callback·admin/users 가 사용.

-- (1) 온보딩 게이트 (본인 전용, 경량)
CREATE OR REPLACE FUNCTION public.get_onboarding_gate(p_target uuid)
 RETURNS TABLE(birthdate date, terms_agreed_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.birthdate, p.terms_agreed_at
  FROM public.profiles p
  WHERE p.id = p_target
    AND (p.id = auth.uid() OR p.auth_user_id = auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.get_onboarding_gate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_onboarding_gate(uuid) TO authenticated;

-- (2) PII 표시 (본인/admin=전체, 타인=field_visibility 필터)
CREATE OR REPLACE FUNCTION public.get_profile_pii(p_target uuid)
 RETURNS TABLE(
   birthdate date,
   gender text,
   face_shape text,
   skin_type text,
   skin_concerns text[],
   interested_procedures text[],
   contact_email text,
   fitzpatrick smallint
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_full boolean;
  v_vis jsonb;
BEGIN
  SELECT
    ((p.id = v_uid OR p.auth_user_id = v_uid) OR public.is_admin()),
    COALESCE(p.field_visibility, '{}'::jsonb)
  INTO v_full, v_vis
  FROM public.profiles p
  WHERE p.id = p_target;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_full THEN
    RETURN QUERY
      SELECT p.birthdate, p.gender, p.face_shape, p.skin_type,
             p.skin_concerns, p.interested_procedures, p.contact_email, p.fitzpatrick
      FROM public.profiles p WHERE p.id = p_target;
  ELSE
    -- 타인 열람: field_visibility 로 공개된 필드만(기본 공개 — 명시적 false 만 숨김).
    RETURN QUERY
      SELECT
        CASE WHEN COALESCE((v_vis->>'birthdate')::boolean, true) THEN p.birthdate END,
        CASE WHEN COALESCE((v_vis->>'gender')::boolean, true) THEN p.gender END,
        CASE WHEN COALESCE((v_vis->>'face_shape')::boolean, true) THEN p.face_shape END,
        CASE WHEN COALESCE((v_vis->>'skin_type')::boolean, true) THEN p.skin_type END,
        CASE WHEN COALESCE((v_vis->>'skin_concerns')::boolean, true) THEN p.skin_concerns END,
        CASE WHEN COALESCE((v_vis->>'interested_procedures')::boolean, true) THEN p.interested_procedures END,
        NULL::text,      -- contact_email: 타인에겐 항상 비공개
        NULL::smallint   -- fitzpatrick: 타인에겐 항상 비공개
      FROM public.profiles p WHERE p.id = p_target;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_profile_pii(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_pii(uuid) TO authenticated;
