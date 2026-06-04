-- 0222: propagate_onboarding_to_doctor_bundle — 신규 동의 컬럼 복제 추가 (F-1, 결정 2)
--
-- 의사 멀티 계정 묶음에서 source 명함의 온보딩·동의 정보를 같은 묶음의 다른 명함에
-- COALESCE(NULL 칸만) 복제하는 기존 함수에, 0221 에서 신설한 동의 컬럼들을 추가한다.
--
-- ⚠ 본 정의는 2026-06-04 시점 live production 함수 정의를 VERBATIM 으로 복사한 뒤
--    동의 컬럼만 SELECT/UPDATE 에 추가한 것이다 (기존 복사 항목 누락 0건).
--    기존 live 복사 목록: birthdate, gender, face_shape, skin_type, skin_concerns,
--      interested_procedures, bio, terms_agreed_at, marketing_email_consent.
--    (liked_procedures/legal_name 은 0184/0110 에서 컬럼 DROP → live 에 없으므로 추가 안 함.)
--    추가 항목: privacy_agreed_at, marketing_email_consent_at,
--      news_email_consent, news_email_consent_at, terms_agreed_version, privacy_agreed_version.

CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(p_source_profile_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- 0176: doctor_accounts EXISTS → profiles.doctor_id IS NOT NULL.
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
         terms_agreed_version, privacy_agreed_version
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
    privacy_agreed_version = COALESCE(profiles.privacy_agreed_version, v_src.privacy_agreed_version)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, idempotency 위해 명시.
GRANT EXECUTE ON FUNCTION public.propagate_onboarding_to_doctor_bundle(uuid) TO authenticated;
