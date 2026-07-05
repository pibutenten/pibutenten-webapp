-- 0341_doctors_clinic_fields.sql
-- 병원 계정 · 시술노트 대행 — Part A: 원장(doctor) 계정 체계 개편 (2026-07-05)
--
-- 배경 (계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §5.2·§C·§E-H8):
--   원장 소속·재직·공개를 3개 독립 불리언/FK 로 모델링한다.
--     - clinic_id     = 근무 지점(건보 심평원 clinics 코드 참조, 불변). 시술노트 드롭다운 대상.
--     - is_affiliated = 재직/소속. 퇴사 시 false → 드롭다운 제외.
--     - is_listed     = 공개 페이지 on/off. 퇴사와 독립.
--   기존 doctors.clinic(text)·branch(text) 는 표시·레거시 목적으로 보존(§E-H9).
--   로직 판정은 clinic_id 로만 한다.
--
-- 건보(심평원) clinics(요양기관 코드+이름) = 원본 참조 데이터. 이 마이그는 clinics 를 수정하지 않는다.
-- backfill 은 기존 branch 텍스트('강남점' 등) → clinic_id 매핑(§C, clinics 이름이 동일해 이름 매핑 불가).
--   강남점=16957 · 건대점=16956 · 대구점=16958 · 수원점=16959 · 판교점=16955 (주소 교차확인 완료 2026-07-05).
--
-- 이 마이그는 전부 additive(ADD COLUMN IF NOT EXISTS·CREATE INDEX IF NOT EXISTS) + backfill UPDATE +
--   admin_create_doctor_profile CREATE OR REPLACE(파라미터 2개 추가) 이다. 파괴적 작업 없음.

BEGIN;

-- 1~3. doctors 3개 컬럼 추가 (전부 additive).
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS clinic_id bigint REFERENCES public.clinics(id) ON DELETE SET NULL;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS is_affiliated boolean NOT NULL DEFAULT true;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true;

-- 4. clinic_id 부분 인덱스 (드롭다운·소속 조회용).
CREATE INDEX IF NOT EXISTS doctors_clinic_id_idx
  ON public.doctors (clinic_id)
  WHERE clinic_id IS NOT NULL;

-- 5. backfill — 지점명 텍스트(branch) → clinic_id (건보 코드). slug 아님.
UPDATE public.doctors
SET clinic_id = CASE branch
  WHEN '강남점' THEN 16957
  WHEN '건대점' THEN 16956
  WHEN '대구점' THEN 16958
  WHEN '수원점' THEN 16959
  WHEN '판교점' THEN 16955
  ELSE clinic_id
END
WHERE clinic_id IS NULL;

-- 6. admin_create_doctor_profile 확장 — 파라미터 2개 추가(p_clinic_id·p_is_listed).
--    기존 시그니처(uuid,text,text,text,text,text)를 먼저 DROP 후 8인자로 재정의.
--    본문·검증·묶음중복·slug중복·handle생성·profiles INSERT·RETURN 은 0192 와 100% 동일하게 유지하고,
--    doctors INSERT 절에만 clinic_id·is_listed 컬럼을 추가한다.
--    p_is_listed 기본 false = 신규 원장은 비공개 기본(관리자가 명시적으로 공개). 미활동 6명 기본 off 와 정합(§E-H8).
DROP FUNCTION IF EXISTS public.admin_create_doctor_profile(uuid, text, text, text, text, text);

CREATE FUNCTION public.admin_create_doctor_profile(
  p_source_profile_id uuid,
  p_slug text,
  p_name text,
  p_clinic text DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_clinic_id bigint DEFAULT NULL,
  p_is_listed boolean DEFAULT false
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

  -- 6. doctors row 신설. (clinic_id·is_listed 추가 — 0341)
  INSERT INTO doctors (slug, name, clinic, branch, title, clinic_id, is_listed)
  VALUES (
    v_slug,
    v_name,
    COALESCE(NULLIF(btrim(coalesce(p_clinic, '')), ''), '힐하우스피부과'),
    NULLIF(btrim(coalesce(p_branch, '')), ''),
    COALESCE(NULLIF(btrim(coalesce(p_title, '')), ''), '피부과 전문의'),
    p_clinic_id,
    COALESCE(p_is_listed, false)
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
-- 새 8인자 시그니처 기준.
REVOKE ALL ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text, bigint, boolean) FROM public;
REVOKE ALL ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text, bigint, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_doctor_profile(uuid, text, text, text, text, text, bigint, boolean) TO service_role;

COMMIT;
