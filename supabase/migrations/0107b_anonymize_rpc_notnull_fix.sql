-- 0107b_anonymize_rpc_notnull_fix.sql
-- Phase 6-7 fix (2026-05-16): anonymize_user_content_before_delete RPC 가
--   marketing_email_consent / liked_procedures / field_visibility 를 NULL 로
--   set 하려다 NOT NULL constraint 위반.
-- 변경:
--   - marketing_email_consent → false (탈퇴 시 동의 철회)
--   - liked_procedures → '{}' (빈 배열)
--   - field_visibility → '{}'::jsonb (빈 객체)
--   - skin_concerns / interested_procedures 도 NULL 대신 빈 배열 안전화

CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(
  cards_moved int,
  comments_moved int,
  profiles_anonymized int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_bundle uuid[];
  v_cards int := 0;
  v_comments int := 0;
  v_profiles int := 0;
  v_sentinel uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  SELECT array_agg(id) INTO v_bundle
  FROM public.profiles
  WHERE id = v_auth OR auth_user_id = v_auth;

  IF v_bundle IS NULL OR array_length(v_bundle, 1) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  UPDATE public.cards
  SET author_id = v_sentinel
  WHERE author_id = ANY(v_bundle);
  GET DIAGNOSTICS v_cards = ROW_COUNT;

  UPDATE public.comments
  SET author_id = v_sentinel
  WHERE author_id = ANY(v_bundle);
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  UPDATE public.profiles
  SET
    legal_name = NULL,
    birthdate = NULL,
    gender = NULL,
    face_shape = NULL,
    skin_type = NULL,
    skin_concerns = '{}'::text[],
    interested_procedures = '{}'::text[],
    liked_procedures = '{}'::text[],
    bio = NULL,
    avatar_url = NULL,
    display_name = '(탈퇴한 사용자)',
    field_visibility = '{}'::jsonb,
    marketing_email_consent = false,
    is_public = false,
    updated_at = now()
  WHERE id = ANY(v_bundle);
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  RETURN QUERY SELECT v_cards, v_comments, v_profiles;
END;
$$;
