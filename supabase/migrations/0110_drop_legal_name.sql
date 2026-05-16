-- 0110_drop_legal_name.sql
-- Phase 7-extra (2026-05-16): legal_name 컬럼 폐기.
--
-- 배경:
--   현재 사용자들이 온보딩에서 실명 입력을 부담스러워함.
--   contact_email 기반 dedup 으로 전환 (0111).
--
-- 변경:
--   1) find_duplicate_profiles(text,date,text) — 옛 legal_name 인자 시그니처 DROP
--   2) profiles_dedup_idx (legal_name, birthdate, gender) DROP
--   3) profiles.legal_name 컬럼 DROP
--   4) anonymize_user_content_before_delete RPC 재작성 (legal_name 라인 제거)

BEGIN;

-- 1) 옛 dedup RPC DROP — 0111 에서 새 시그니처로 재정의
DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);

-- 2) 인덱스 DROP
DROP INDEX IF EXISTS public.profiles_dedup_idx;

-- 3) 컬럼 DROP
ALTER TABLE public.profiles DROP COLUMN IF EXISTS legal_name;

-- 4) anonymize RPC 재작성 (legal_name 줄 제거)
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

SELECT 'OK 0110' AS status;
