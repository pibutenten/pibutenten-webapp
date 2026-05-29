-- 0192_admin_create_doctor_profile.sql
-- 원장 계정 연결 기능 (CRITICAL-3 제거 자리 대체, 2026-05-30)
--
-- 배경:
--   어제(2026-05-29) "회원→의사 role 변경 + 회원 글 doctor_id 소급 백필" 라우트를
--   CRITICAL-3 으로 제거 (ADR 0012 명함 단위 완전 독립 위반). 그 자리를, 안전한
--   "원장 명함 신설·연결" 흐름으로 대체한다.
--
-- 이 함수가 하는 일 (단일 트랜잭션 = 원자적):
--   1. 선택한 회원 명함(source)을 원본으로, 같은 묶음(auth_user_id)에 새 원장 명함 생성
--   2. doctors row 신설 (slug·name 필수, clinic/title 기본값, branch 선택)
--   3. source 회원 명함의 온보딩 PII 를 새(빈) 원장 명함에 복사
--      (새 명함은 빈 칸이므로 전량 복사 = COALESCE 와 동등. 이후 명함별 독립 수정 가능)
--
-- ★ 절대 하지 않는 일 (CRITICAL-3 재발 방지):
--   - source 회원 명함의 role 변경 안 함 (회원은 회원으로 유지)
--   - source 회원 명함이 쓴 글(cards)에 doctor_id 소급 백필 안 함 (도장 금지)
--   - 새 원장 명함은 "새로 생성된 빈 명함". 회원 글을 물려받지 않음
--   → 이 함수는 오직 INSERT(doctors 1, profiles 1) + source 에서 복사(읽기)만 한다.
--     source 명함 row 를 UPDATE 하지 않는다.
--
-- 호출 경로: admin 라우트가 service_role(admin client)로만 호출.
--   admin 권한 게이트는 애플리케이션 계층(requireAdmin, ADR 0012 active 명함 기준)에서 검사.
--   → 본 함수는 authenticated 에 GRANT 하지 않는다 (service_role 전용).
--     auth.uid() 에 의존하지 않는다 (service_role 호출 시 NULL 이므로).

CREATE OR REPLACE FUNCTION public.admin_create_doctor_profile(
  p_source_profile_id uuid,
  p_slug text,
  p_name text,
  p_clinic text DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;              -- 묶음 주인 (source 의 auth_user_id, 없으면 자기 id)
  v_src record;
  v_new_doctor_id uuid;
  v_new_profile_id uuid := gen_random_uuid();
  v_handle text;
  v_base text;
  v_candidate text;
  v_taken boolean;
  v_suffix int;
  v_existing_doctor int;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  -- 1. 입력 검증
  --    slug: 소문자 영숫자 + 하이픈, 앞뒤는 영숫자 (SEO URL /doctors/{slug}/...)
  IF v_slug = '' OR v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid slug' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'invalid name' USING ERRCODE = '22023';
  END IF;

  -- 2. source 회원 명함 조회 + 묶음 주인 결정
  SELECT id, auth_user_id, display_name, role, birthdate, terms_agreed_at,
         gender, face_shape, skin_type, skin_concerns, interested_procedures,
         bio, marketing_email_consent
    INTO v_src
  FROM profiles
  WHERE id = p_source_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source profile not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_owner := COALESCE(v_src.auth_user_id, v_src.id);

  -- 3. 온보딩 완료 검증 — PII 복사 원본이 있어야 한다 (birthdate 기준).
  IF v_src.birthdate IS NULL THEN
    RAISE EXCEPTION 'source not onboarded' USING ERRCODE = '23514';
  END IF;

  -- 4. 중복 방지 — 같은 묶음에 이미 원장 명함이 있으면 거부.
  SELECT count(*) INTO v_existing_doctor
  FROM profiles
  WHERE id IN (SELECT same_group_profile_ids(v_owner))
    AND doctor_id IS NOT NULL;
  IF v_existing_doctor > 0 THEN
    RAISE EXCEPTION 'bundle already has doctor profile' USING ERRCODE = '23505';
  END IF;

  -- 5. slug 중복 확인 (doctors.slug UNIQUE — 명확한 메시지).
  IF EXISTS (SELECT 1 FROM doctors WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'slug already exists' USING ERRCODE = '23505';
  END IF;

  -- 6. doctors row 신설.
  INSERT INTO doctors (slug, name, clinic, branch, title)
  VALUES (
    v_slug,
    v_name,
    COALESCE(NULLIF(btrim(coalesce(p_clinic, '')), ''), '힐하우스피부과'),
    NULLIF(btrim(coalesce(p_branch, '')), ''),
    COALESCE(NULLIF(btrim(coalesce(p_title, '')), ''), '피부과 전문의')
  )
  RETURNING id INTO v_new_doctor_id;

  -- 7. 고유 handle 생성 (slug 기반, profiles.handle UNIQUE + reserved_handles 회피).
  v_base := regexp_replace(v_slug, '[^a-z0-9-]', '', 'g');
  IF v_base = '' THEN v_base := 'dr'; END IF;
  v_handle := NULL;
  FOR v_suffix IN 0..99 LOOP
    IF v_suffix = 0 THEN v_candidate := v_base;
    ELSE v_candidate := v_base || '-' || v_suffix; END IF;
    SELECT (EXISTS(SELECT 1 FROM profiles WHERE handle = v_candidate)
         OR EXISTS(SELECT 1 FROM reserved_handles WHERE handle = v_candidate))
      INTO v_taken;
    IF NOT v_taken THEN v_handle := v_candidate; EXIT; END IF;
  END LOOP;
  IF v_handle IS NULL THEN
    v_handle := 'dr-' || replace(v_new_profile_id::text, '-', '');
  END IF;

  -- 8. 새 원장 명함(profiles) 생성 — 같은 묶음, role=doctor, doctor_id 인라인.
  --    새 명함은 빈 칸이므로 source PII 를 그대로 채운다 (COALESCE 와 동등).
  --    avatar_url/display_name 은 의사 신분 정보(doctors)에서 관리 → display_name 은 의사명 사용.
  INSERT INTO profiles (
    id, auth_user_id, role, doctor_id, handle, display_name,
    birthdate, gender, face_shape, skin_type, skin_concerns,
    interested_procedures, bio, terms_agreed_at, marketing_email_consent
  ) VALUES (
    v_new_profile_id, v_owner, 'doctor', v_new_doctor_id, v_handle, v_name,
    v_src.birthdate, v_src.gender, v_src.face_shape, v_src.skin_type, v_src.skin_concerns,
    v_src.interested_procedures, v_src.bio, v_src.terms_agreed_at, v_src.marketing_email_consent
  );

  RETURN jsonb_build_object(
    'profile_id', v_new_profile_id,
    'doctor_id', v_new_doctor_id,
    'handle', v_handle,
    'auth_user_id', v_owner,
    'slug', v_slug
  );
END;
$$;

-- service_role 전용 (admin 라우트가 admin client 로 호출). authenticated 에는 노출 금지.
REVOKE ALL ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text) TO service_role;
