-- 0324_propagate_fitzpatrick.sql
-- propagate_onboarding_to_doctor_bundle 에 fitzpatrick 복제 추가 (CLAUDE.md 동기화 규칙)
--
-- 배경: 0323 에서 profiles.fitzpatrick smallint CHECK(1~6 OR NULL) 신설.
--   의사 멀티 계정 묶음에 온보딩 정보를 COALESCE 복제하는 RPC 가 fitzpatrick 을
--   누락하고 있어, 첫 명함 온보딩 완료 시 묶음 내 다른 명함에 피부광반응 유형이
--   전파되지 않는 정합성 결함을 수정한다.
--
-- 변경 내용 (0222 본문 VERBATIM 기반):
--   1. SELECT INTO v_src 에 fitzpatrick 추가
--   2. UPDATE SET 에 fitzpatrick = COALESCE(profiles.fitzpatrick, v_src.fitzpatrick) 추가
--      (smallint 단일값이므로 array_length CASE 없이 단순 COALESCE)
--   3. 0274 에서 ALTER FUNCTION 으로 설정한 SET search_path 를 함수 정의에 포함
--      (CREATE OR REPLACE 는 ALTER 로 설정된 SET 절을 초기화하므로 명시 필요)

CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(p_source_profile_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
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

  -- 0176: doctor_accounts EXISTS -> profiles.doctor_id IS NOT NULL.
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id IN (SELECT same_group_profile_ids(v_auth))
      AND doctor_id IS NOT NULL
  ) INTO v_has_doctor;
  IF NOT v_has_doctor THEN RETURN 0; END IF;

  SELECT birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures,
         bio, terms_agreed_at, marketing_email_consent,
         privacy_agreed_at, marketing_email_consent_at,
         news_email_consent, news_email_consent_at,
         terms_agreed_version, privacy_agreed_version,
         fitzpatrick
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
    marketing_email_consent = COALESCE(profiles.marketing_email_consent, v_src.marketing_email_consent),
    privacy_agreed_at      = COALESCE(profiles.privacy_agreed_at, v_src.privacy_agreed_at),
    marketing_email_consent_at = COALESCE(profiles.marketing_email_consent_at, v_src.marketing_email_consent_at),
    news_email_consent     = COALESCE(profiles.news_email_consent, v_src.news_email_consent),
    news_email_consent_at  = COALESCE(profiles.news_email_consent_at, v_src.news_email_consent_at),
    terms_agreed_version   = COALESCE(profiles.terms_agreed_version, v_src.terms_agreed_version),
    privacy_agreed_version = COALESCE(profiles.privacy_agreed_version, v_src.privacy_agreed_version),
    fitzpatrick            = COALESCE(profiles.fitzpatrick, v_src.fitzpatrick)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, idempotency 위해 명시.
GRANT EXECUTE ON FUNCTION public.propagate_onboarding_to_doctor_bundle(uuid) TO authenticated;
