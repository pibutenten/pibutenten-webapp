-- 0184. profiles 정비 ③ — liked_procedures 컬럼 DROP + 트리거 2개 재정의
--
-- 배경:
--   - 데이터: 44명 중 3명만 입력 (6.8%). 온보딩에서 안 받음. settings UI 의 유령 필드.
--   - 사용자 정책: "온보딩 §5 관심 키워드와 의미 중복" — 완전 제거.
--
-- 의존 객체 (모두 같은 마이그에서 정리):
--   - anonymize_user_content_before_delete: liked_procedures = '{}'::text[] 라인 제거
--   - propagate_onboarding_to_doctor_bundle: SELECT INTO 절 + UPDATE 절 양쪽에서 라인 제거
--   - field_visibility JSON 키 'liked_procedures' 44명 전원 → '-' 연산자로 키 제거
--   - 0028/0033/0106/0106b/0122/0123 마이그 본문은 변경 안 함 (히스토리 보존, 컬럼 사라지면 자연 무효화)
--
-- 처리 순서:
--   (1) anonymize 재정의 → (2) propagate 재정의 → (3) field_visibility UPDATE → (4) 컬럼 DROP
--   3·4 사이에 트리거 함수가 컬럼 참조하면 DROP 막힘 → 함수부터 재정의.

-- (1) anonymize 재정의 — liked_procedures 라인만 제거. 본문은 0183 직후 상태 그대로.
CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(profiles_anonymized integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_mask text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;
  v_target := COALESCE(public.current_active_profile_id(), v_uid);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_target AND (p.id = v_uid OR p.auth_user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_mask := 'deleted-' || substring(replace(v_target::text, '-', ''), 1, 12);
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
    field_visibility = '{}'::jsonb,
    marketing_email_consent = false,
    auth_user_id = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = v_target;

  RETURN QUERY SELECT 1;
END;
$$;

-- (2) propagate_onboarding_to_doctor_bundle 재정의 — SELECT 와 UPDATE 양쪽에서 liked_procedures 라인 제거
CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(p_source_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_source_auth_user uuid;
  v_has_doctor boolean;
  v_updated int;
  v_src record;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT auth_user_id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id;
  IF v_source_auth_user IS NULL THEN
    SELECT id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id AND id = v_auth;
    IF v_source_auth_user IS NULL THEN RAISE EXCEPTION 'source profile not found'; END IF;
  END IF;
  IF v_source_auth_user != v_auth THEN RAISE EXCEPTION 'not your bundle'; END IF;

  -- 0176: doctor_accounts EXISTS → profiles.doctor_id IS NOT NULL.
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id IN (SELECT same_group_profile_ids(v_auth))
      AND doctor_id IS NOT NULL
  ) INTO v_has_doctor;
  IF NOT v_has_doctor THEN RETURN 0; END IF;

  SELECT birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures,
         bio, terms_agreed_at, marketing_email_consent
  INTO v_src FROM profiles WHERE id = p_source_profile_id;

  UPDATE profiles SET
    birthdate              = COALESCE(profiles.birthdate, v_src.birthdate),
    gender                 = COALESCE(profiles.gender, v_src.gender),
    face_shape             = COALESCE(profiles.face_shape, v_src.face_shape),
    skin_type              = COALESCE(profiles.skin_type, v_src.skin_type),
    skin_concerns          = CASE WHEN profiles.skin_concerns IS NULL OR array_length(profiles.skin_concerns, 1) IS NULL THEN v_src.skin_concerns ELSE profiles.skin_concerns END,
    interested_procedures  = CASE WHEN profiles.interested_procedures IS NULL OR array_length(profiles.interested_procedures, 1) IS NULL THEN v_src.interested_procedures ELSE profiles.interested_procedures END,
    bio                    = COALESCE(profiles.bio, v_src.bio),
    terms_agreed_at        = COALESCE(profiles.terms_agreed_at, v_src.terms_agreed_at),
    marketing_email_consent = COALESCE(profiles.marketing_email_consent, v_src.marketing_email_consent)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- (3) field_visibility JSON 에서 'liked_procedures' 키 제거 (44명 전원)
UPDATE public.profiles
   SET field_visibility = field_visibility - 'liked_procedures'
 WHERE field_visibility ? 'liked_procedures';

-- (4) 컬럼 DROP
ALTER TABLE public.profiles DROP COLUMN IF EXISTS liked_procedures;
