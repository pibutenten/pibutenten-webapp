-- 0106_propagate_onboarding_to_doctor_bundle.sql
-- Phase 6-NEW (2026-05-16):
--   의사 멀티 계정 보유자에 한해, source profile 의 온보딩 정보를
--   같은 묶음의 다른 profile 들에 일괄 복사 (avatar/display_name/handle/role/doctor_id 제외).
--
-- COALESCE 패턴: 이미 다른 row 에 값이 있으면 덮어쓰지 않음.
--   → "최초 1회 이식 후 독립 수정 가능" 의 자연스러운 구현.
--   → ProfileEditClient 에서 매 저장마다 호출되어도 무해 (이미 값 있는 컬럼은 보존).

CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(
  p_source_profile_id uuid
)
RETURNS int -- 업데이트된 row 수
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_source_auth_user uuid;
  v_has_doctor boolean;
  v_updated int;
  v_src record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  -- source 의 auth_user_id 조회 + 본인 묶음 검증
  SELECT auth_user_id INTO v_source_auth_user
  FROM profiles
  WHERE id = p_source_profile_id;

  IF v_source_auth_user IS NULL THEN
    -- legacy: id == auth_user_id 인 primary row 인 경우 auth_user_id 가 NULL 일 수도
    SELECT id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id AND id = v_auth;
    IF v_source_auth_user IS NULL THEN
      RAISE EXCEPTION 'source profile not found';
    END IF;
  END IF;

  -- 본인 묶음 검증
  IF v_source_auth_user != v_auth THEN
    RAISE EXCEPTION 'not your bundle';
  END IF;

  -- 의사 멀티 계정 여부 — 묶음 안에 doctor_accounts 매핑이 있는 profile 이 있어야 propagation 진행
  SELECT EXISTS(
    SELECT 1 FROM doctor_accounts da
    JOIN profiles p ON da.profile_id = p.id
    WHERE p.id IN (SELECT same_group_profile_ids(v_auth))
  ) INTO v_has_doctor;

  IF NOT v_has_doctor THEN
    -- 의사 멀티 계정 아니면 ZERO row update (caller 가 적절히 핸들)
    RETURN 0;
  END IF;

  -- source row 의 12개 컬럼 가져오기
  SELECT
    birthdate, gender, face_shape, skin_type,
    skin_concerns, interested_procedures,
    bio, legal_name,
    liked_procedures, field_visibility, marketing_email_consent,
    terms_agreed_at
  INTO v_src
  FROM profiles
  WHERE id = p_source_profile_id;

  -- 묶음 안의 다른 row 들에 일괄 복사 (source 제외, COALESCE 로 NULL 덮어쓰기 방지)
  UPDATE profiles SET
    birthdate              = COALESCE(profiles.birthdate, v_src.birthdate),
    gender                 = COALESCE(profiles.gender, v_src.gender),
    face_shape             = COALESCE(profiles.face_shape, v_src.face_shape),
    skin_type              = COALESCE(profiles.skin_type, v_src.skin_type),
    skin_concerns          = CASE
                               WHEN profiles.skin_concerns IS NULL OR array_length(profiles.skin_concerns, 1) IS NULL
                               THEN v_src.skin_concerns
                               ELSE profiles.skin_concerns
                             END,
    interested_procedures  = CASE
                               WHEN profiles.interested_procedures IS NULL OR array_length(profiles.interested_procedures, 1) IS NULL
                               THEN v_src.interested_procedures
                               ELSE profiles.interested_procedures
                             END,
    liked_procedures       = CASE
                               WHEN profiles.liked_procedures IS NULL OR array_length(profiles.liked_procedures, 1) IS NULL
                               THEN v_src.liked_procedures
                               ELSE profiles.liked_procedures
                             END,
    bio                    = COALESCE(profiles.bio, v_src.bio),
    legal_name             = COALESCE(profiles.legal_name, v_src.legal_name),
    field_visibility       = COALESCE(profiles.field_visibility, v_src.field_visibility),
    marketing_email_consent = COALESCE(profiles.marketing_email_consent, v_src.marketing_email_consent),
    terms_agreed_at        = COALESCE(profiles.terms_agreed_at, v_src.terms_agreed_at)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.propagate_onboarding_to_doctor_bundle(uuid) TO authenticated;
