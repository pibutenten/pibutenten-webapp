-- 0106b_backfill_doctor_bundle_onboarding.sql
-- Phase 6-NEW (2026-05-16) 1회성 백필:
--   의사 멀티 계정 묶음에 대해 source = (각 묶음 내 birthdate IS NOT NULL 인 row 중 가장 최근 update)
--   의 데이터를 묶음 내 다른 row 들에 COALESCE 로 propagate.
--   avatar_url / display_name / handle / role / doctor_id 절대 X.

DO $$
DECLARE
  r record;
  v_src_id uuid;
BEGIN
  FOR r IN (
    SELECT DISTINCT
      COALESCE(p.auth_user_id, p.id) AS auth_user_id
    FROM profiles p
    WHERE p.id IN (
      SELECT da.profile_id FROM doctor_accounts da
    )
    OR p.auth_user_id IN (
      SELECT COALESCE(p2.auth_user_id, p2.id)
      FROM profiles p2
      WHERE p2.id IN (SELECT da.profile_id FROM doctor_accounts da)
    )
  ) LOOP
    -- 묶음 안에서 birthdate IS NOT NULL 인 row 중 가장 최근 update 한 row 를 source 로 선택
    SELECT id INTO v_src_id
    FROM profiles
    WHERE (id = r.auth_user_id OR auth_user_id = r.auth_user_id)
      AND birthdate IS NOT NULL
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_src_id IS NOT NULL THEN
      -- 같은 묶음 내 다른 row 들에 source 의 NULL 컬럼 값 복사
      UPDATE profiles p SET
        birthdate              = COALESCE(p.birthdate, src.birthdate),
        gender                 = COALESCE(p.gender, src.gender),
        face_shape             = COALESCE(p.face_shape, src.face_shape),
        skin_type              = COALESCE(p.skin_type, src.skin_type),
        skin_concerns          = CASE WHEN p.skin_concerns IS NULL OR array_length(p.skin_concerns, 1) IS NULL THEN src.skin_concerns ELSE p.skin_concerns END,
        interested_procedures  = CASE WHEN p.interested_procedures IS NULL OR array_length(p.interested_procedures, 1) IS NULL THEN src.interested_procedures ELSE p.interested_procedures END,
        liked_procedures       = CASE WHEN p.liked_procedures IS NULL OR array_length(p.liked_procedures, 1) IS NULL THEN src.liked_procedures ELSE p.liked_procedures END,
        bio                    = COALESCE(p.bio, src.bio),
        legal_name             = COALESCE(p.legal_name, src.legal_name),
        field_visibility       = COALESCE(p.field_visibility, src.field_visibility),
        marketing_email_consent = COALESCE(p.marketing_email_consent, src.marketing_email_consent),
        terms_agreed_at        = COALESCE(p.terms_agreed_at, src.terms_agreed_at)
      FROM (SELECT * FROM profiles WHERE id = v_src_id) src
      WHERE (p.id = r.auth_user_id OR p.auth_user_id = r.auth_user_id)
        AND p.id != v_src_id;

      RAISE NOTICE 'Propagated bundle (auth_user=%, source=%)', r.auth_user_id, v_src_id;
    ELSE
      RAISE NOTICE 'No source (birthdate IS NOT NULL) in bundle auth_user=%', r.auth_user_id;
    END IF;
  END LOOP;
END $$;
