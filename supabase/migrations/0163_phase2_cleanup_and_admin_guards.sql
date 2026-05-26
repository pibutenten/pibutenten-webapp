-- 0163: Phase 2-C — 정리 + admin 가드 방어 심층화 (2026-05-26)
--
-- 사용자 정책 ("모든 데이터는 계정별 완전 독립. 묶음은 전환 메커니즘") 정합 후속:
--   1. propagate_onboarding_to_doctor_bundle 의 복사 대상 컬럼 축소 (PIPA + UX)
--   2. find_auth_user_by_email_with_providers admin 가드 추가 (PIPA enumeration 방어)
--   3. rotate_push_webhook_secret admin 가드 추가 (방어 심층화)
--   4. search_logs 중복 정책 정리

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. propagate_onboarding_to_doctor_bundle — 복사 대상 컬럼 정정
--    제거: field_visibility (UX — 의사 신분은 노출 정책 따로)
--          legal_name (0110 에서 컬럼 drop 됨 — 함수 본문에서도 제거)
--    유지: birthdate, gender, face_shape, skin_type, skin_concerns,
--          interested_procedures, liked_procedures (사람 단위 사실 정보)
--          bio (UX — 빈 경우만 복사, 신분별 다르게 쓰면 그게 우선)
--          terms_agreed_at, marketing_email_consent
--            (사용자 결정 — 의사 신분 동의는 구두로 별도 받음. 사람 단위로 인정.
--             COALESCE 라 빈 경우만 복사 — 한 신분에서 명시 입력했으면 우선.)
--
--    동작: "복사 후 독립" 패턴. COALESCE 로 이미 채워진 값은 덮어쓰지 않음.
--    한 신분에서 값 수정해도 다른 신분에 영향 X. 사용자 정책 "각 계정 독립" 부합.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propagate_onboarding_to_doctor_bundle(p_source_profile_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
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
  FROM profiles WHERE id = p_source_profile_id;
  IF v_source_auth_user IS NULL THEN
    SELECT id INTO v_source_auth_user FROM profiles WHERE id = p_source_profile_id AND id = v_auth;
    IF v_source_auth_user IS NULL THEN
      RAISE EXCEPTION 'source profile not found';
    END IF;
  END IF;
  IF v_source_auth_user != v_auth THEN
    RAISE EXCEPTION 'not your bundle';
  END IF;

  -- 묶음 안에 doctor 매핑 있는 경우만 propagation (의사 멀티 계정 케이스)
  SELECT EXISTS(
    SELECT 1 FROM doctor_accounts da
    JOIN profiles p ON da.profile_id = p.id
    WHERE p.id IN (SELECT same_group_profile_ids(v_auth))
  ) INTO v_has_doctor;
  IF NOT v_has_doctor THEN
    RETURN 0;
  END IF;

  -- 복사 대상: PII 7개 + bio + terms_agreed_at + marketing_email_consent (총 10개)
  -- 제외: field_visibility (UX — 신분별 노출 정책 따로), legal_name (drop 됨)
  SELECT
    birthdate, gender, face_shape, skin_type,
    skin_concerns, interested_procedures, liked_procedures,
    bio, terms_agreed_at, marketing_email_consent
  INTO v_src
  FROM profiles WHERE id = p_source_profile_id;

  -- 묶음 안의 다른 row 들에 빈 컬럼만 복사 (COALESCE — 이미 값 있으면 유지)
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
    terms_agreed_at        = COALESCE(profiles.terms_agreed_at, v_src.terms_agreed_at),
    marketing_email_consent = COALESCE(profiles.marketing_email_consent, v_src.marketing_email_consent)
  WHERE profiles.id IN (SELECT same_group_profile_ids(v_auth))
    AND profiles.id != p_source_profile_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. find_auth_user_by_email_with_providers — service_role / admin 가드
--    PIPA enumeration attack 방어. 본 함수는 Naver/Google OAuth callback
--    route (server-side, service_role 키 사용) 에서 가입자 조회에 사용.
--    일반 authenticated 사용자 + anon 은 차단 — 임의 이메일로 가입 여부 +
--    OAuth provider 노출 방지. admin 도 향후 운영 도구에서 사용 가능하게 허용.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_auth_user_by_email_with_providers(p_email text)
  RETURNS TABLE(user_id uuid, providers text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
AS $$
BEGIN
  -- service_role (서버사이드 OAuth callback) 또는 admin 만 통과
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'service_role or admin only' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id AS user_id,
    COALESCE(array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
             ARRAY[]::text[]) AS providers
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  GROUP BY u.id
  LIMIT 1;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. rotate_push_webhook_secret — admin 가드 (방어 심층화)
--    옛 본문은 길이 검증만. grant 가 admin role 에만 부여돼 있다 해도 본문
--    가드가 있어야 grant 실수 시 노출 방어.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rotate_push_webhook_secret(p_new_secret text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_existing_id uuid;
  v_len int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  v_len := length(p_new_secret);
  IF v_len < 40 THEN
    RAISE EXCEPTION 'secret too short: % bytes (need >= 40)', v_len USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'push_webhook_secret';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(p_new_secret, 'push_webhook_secret',
      'Push notification webhook shared secret');
  ELSE
    PERFORM vault.update_secret(v_existing_id, p_new_secret, 'push_webhook_secret',
      'Push notification webhook shared secret');
  END IF;

  RETURN jsonb_build_object('ok', true, 'length', v_len, 'rotated_at', now());
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. search_logs 중복 정책 정리 — 옛 콜론 정책명 DROP, 새 underscore 만 유지
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "search_logs: admin select" ON public.search_logs;
DROP POLICY IF EXISTS "search_logs: anyone insert" ON public.search_logs;

-- 검증
SELECT polname FROM pg_policy
WHERE polrelid = 'public.search_logs'::regclass
ORDER BY polname;

SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('propagate_onboarding_to_doctor_bundle',
                  'find_auth_user_by_email_with_providers',
                  'rotate_push_webhook_secret')
ORDER BY proname;

COMMIT;
