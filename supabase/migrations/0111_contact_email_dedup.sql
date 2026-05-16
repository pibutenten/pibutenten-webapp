-- 0111_contact_email_dedup.sql
-- Phase 7-extra (2026-05-16): 이메일 기반 dedup 도입.
--
-- 정책:
--   온보딩에서 실명 대신 이메일을 받음 (OAuth provider email prefill, 사용자 수정 가능).
--   같은 (email, birthdate, gender) 묶음이 이미 있으면 dedup 다이얼로그 표시.
--   사용자가 다른 이메일 입력하면 dedup 안 걸려도 정책상 허용 (사용자 선택 존중).
--
-- 변경:
--   1) profiles.contact_email TEXT 컬럼 추가 (lowercase 권장, 형식 validation 은 application)
--   2) (contact_email, birthdate, gender) partial 인덱스 — deleted_at IS NULL
--   3) find_duplicate_profiles(text,date,text) — email 인자로 재정의
--   4) anonymize RPC 에 contact_email = NULL 추가

BEGIN;

-- 1) 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN public.profiles.contact_email IS
  '연락용 이메일. OAuth provider email 이 기본값. 중복 가입자 식별에 사용 (display 무관).';

-- 2) dedup 인덱스 — 활성 사용자만
CREATE INDEX IF NOT EXISTS profiles_dedup_email_idx
  ON public.profiles (contact_email, birthdate, gender)
  WHERE contact_email IS NOT NULL AND deleted_at IS NULL;

-- 3) find_duplicate_profiles 재정의 — email 기반
DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);

CREATE FUNCTION public.find_duplicate_profiles(
  p_email text,
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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0
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
  WHERE lower(p.contact_email) = lower(trim(p_email))
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    AND p.deleted_at IS NULL
    -- 본인 묶음 제외
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text) TO authenticated;

-- 4) anonymize RPC 에 contact_email NULL 추가
DROP FUNCTION IF EXISTS public.anonymize_user_content_before_delete();

CREATE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(profiles_anonymized int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_bundle uuid[];
  v_profiles int := 0;
  v_id uuid;
  v_mask text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  SELECT array_agg(id) INTO v_bundle
  FROM public.profiles
  WHERE id = v_auth OR auth_user_id = v_auth;

  IF v_bundle IS NULL OR array_length(v_bundle, 1) = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  FOREACH v_id IN ARRAY v_bundle LOOP
    v_mask := 'deleted-' || substring(replace(v_id::text, '-', ''), 1, 12);
    UPDATE public.profiles
    SET
      handle = v_mask,
      display_name = '(탈퇴한 사용자)',
      avatar_url = NULL,
      bio = NULL,
      contact_email = NULL,
      birthdate = NULL,
      gender = NULL,
      face_shape = NULL,
      skin_type = NULL,
      skin_concerns = '{}'::text[],
      interested_procedures = '{}'::text[],
      liked_procedures = '{}'::text[],
      field_visibility = '{}'::jsonb,
      marketing_email_consent = false,
      is_public = false,
      auth_user_id = NULL,
      deleted_at = now(),
      updated_at = now()
    WHERE id = v_id;
    v_profiles := v_profiles + 1;
  END LOOP;

  RETURN QUERY SELECT v_profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_content_before_delete() TO authenticated;

COMMIT;

SELECT 'OK 0111' AS status;
