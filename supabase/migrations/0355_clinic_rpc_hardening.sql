-- 0355: 병원 RPC 소규모 하드닝
--  ① 다음 예약일 미래 상한(오타 방어) — clinic_add_visit / clinic_update_visit 두 함수.
--     기존 '방문일 이전 금지'에 '오늘+5년 초과 금지'를 추가. (회원 update_visit 은 예약일 파라미터가
--     없어 대상 아님 — 실측 확인.)
--  ② admin_create_doctor_profile: SET search_path 에 pg_temp 추가(0345/0350 규약 정합, shadow 차단).
--  ※ FOR UPDATE 단일잠금은 생략: clinic_update_visit 의 link 조회는 ORDER BY … LIMIT 1 FOR UPDATE 라
--    Postgres 가 반환 1행만 잠근다(다중행 잠금 미발생) — 감사 지적이 실제로는 성립하지 않아 불변경.
--  본문은 production 현재 정의(pg_get_functiondef)를 그대로 두고 해당 줄만 수정한 CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.clinic_add_visit(p_clinic_profile_id uuid, p_link_id bigint, p_visited_on date, p_procedures jsonb, p_doctor_id uuid DEFAULT NULL::uuid, p_doctor_name text DEFAULT NULL::text, p_manager_name text DEFAULT NULL::text, p_diary_body text DEFAULT NULL::text, p_total_price integer DEFAULT NULL::integer, p_next_appointment_date date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id     bigint;
  v_clinic_name   text;
  v_link          record;
  v_clinic_row    record;
  v_doctor_name   text;
  v_diary_id      bigint;
  v_proc          jsonb;
  v_idx           int := 0;
  v_proc_count    int;
BEGIN
  -- 1. 병원 명함 검증
  SELECT p.clinic_id, COALESCE(NULLIF(p.display_name, ''), '제휴 병원')
    INTO v_clinic_id, v_clinic_name
  FROM public.profiles p
  WHERE p.id = p_clinic_profile_id
    AND p.auth_user_id = auth.uid()
    AND p.role = 'clinic'
    AND p.clinic_id IS NOT NULL
    AND p.deleted_at IS NULL;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized_clinic' USING ERRCODE = '42501';
  END IF;

  -- 2. rate-limit — 지점 단위, 분당 30건
  IF NOT public.check_and_increment_rate_limit(
    'clinic_add_visit:' || v_clinic_id::text, 30, 60
  ) THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = '54000';
  END IF;

  -- 3. 연결 검증 — 자기 지점 + active(동의 완료) 필수. FOR UPDATE 로 동시 revoke 와 직렬화(검수 치명-1).
  SELECT * INTO v_link
  FROM public.clinic_member_links
  WHERE id = p_link_id AND clinic_id = v_clinic_id
  FOR UPDATE;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_link.status <> 'active' THEN
    RAISE EXCEPTION 'link_not_active' USING ERRCODE = '22023';
  END IF;

  -- 4. 입력 검증 (0297 계승)
  IF p_visited_on IS NULL OR p_visited_on > current_date OR p_visited_on < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'invalid_visited_on' USING ERRCODE = '22023';
  END IF;
  IF p_diary_body IS NOT NULL AND char_length(p_diary_body) > 400 THEN
    RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001';
  END IF;
  IF p_total_price IS NOT NULL AND (p_total_price < 0 OR p_total_price > 2000000000) THEN
    RAISE EXCEPTION 'invalid_total_price' USING ERRCODE = '22023';
  END IF;
  -- 다음 예약일: 방문일 이전 금지 + 오늘+5년 초과 미래 금지(0355 오타 방어)
  IF p_next_appointment_date IS NOT NULL
     AND (p_next_appointment_date < p_visited_on
          OR p_next_appointment_date > (current_date + interval '5 years')::date) THEN
    RAISE EXCEPTION 'invalid_next_appointment_date' USING ERRCODE = '22023';
  END IF;
  IF p_doctor_name IS NOT NULL AND char_length(p_doctor_name) > 100 THEN
    RAISE EXCEPTION 'invalid_doctor_name' USING ERRCODE = '22023';
  END IF;
  IF p_manager_name IS NOT NULL AND char_length(p_manager_name) > 100 THEN
    RAISE EXCEPTION 'invalid_manager_name' USING ERRCODE = '22023';
  END IF;

  -- 배열 타입 우선 검증(검수 치명-2) 후 개수 검증
  IF p_procedures IS NULL OR jsonb_typeof(p_procedures) <> 'array' THEN
    RAISE EXCEPTION 'procedures_not_array' USING ERRCODE = '22023';
  END IF;
  v_proc_count := jsonb_array_length(p_procedures);
  IF v_proc_count < 1 OR v_proc_count > 20 THEN
    RAISE EXCEPTION 'invalid_procedures_count' USING ERRCODE = '22023';
  END IF;

  -- 5. 담당 원장 검증 — 자기 지점 재직 원장만(드롭다운 규칙과 동일, §2.1)
  --    doctor_id 선택 시에도 doctor_name 에 이름 스냅샷 저장(§5.3 정정 — 뷰 하위호환+과거기록 불변).
  IF p_doctor_id IS NOT NULL THEN
    SELECT d.name INTO v_doctor_name
    FROM public.doctors d
    WHERE d.id = p_doctor_id
      AND d.clinic_id = v_clinic_id
      AND d.is_affiliated;
    IF v_doctor_name IS NULL THEN
      RAISE EXCEPTION 'invalid_doctor' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_doctor_name := NULLIF(btrim(COALESCE(p_doctor_name, '')), '');
  END IF;

  -- 6. 병원 위치 스냅샷(clinics 원본) — clinic_name 은 지점 구분 위해 병원 명함 display_name(§C)
  SELECT c.addr, c.tel, c.x_pos, c.y_pos INTO v_clinic_row
  FROM public.clinics c WHERE c.id = v_clinic_id;

  -- 7. 시술노트 INSERT — 0343 5컬럼 명시(source='clinic' 대행 표식)
  INSERT INTO public.diaries (
    profile_id, visited_on, visited_on_precision,
    clinic_id, clinic_name, clinic_addr, clinic_tel, clinic_x, clinic_y,
    doctor_name, manager_name, diary_body, total_price, is_complete,
    source, created_by_clinic_profile_id, linked_consent_at,
    next_appointment_date, doctor_id
  ) VALUES (
    v_link.profile_id, p_visited_on, 'exact',
    v_clinic_id, v_clinic_name, v_clinic_row.addr, v_clinic_row.tel,
    v_clinic_row.x_pos, v_clinic_row.y_pos,
    v_doctor_name, NULLIF(btrim(COALESCE(p_manager_name, '')), ''),
    NULLIF(p_diary_body, ''), p_total_price, true,
    'clinic', p_clinic_profile_id, v_link.consent_at,
    p_next_appointment_date, p_doctor_id
  ) RETURNING id INTO v_diary_id;

  -- 8. 시술 자식행 (0279 계승 + tag_dict FK 안전화 + 길이·상한 검증)
  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    IF COALESCE(NULLIF(v_proc->>'procedure_ko', ''), '') = ''
       OR char_length(v_proc->>'procedure_ko') > 100 THEN
      RAISE EXCEPTION 'invalid_procedure_name' USING ERRCODE = '22023';
    END IF;
    IF v_proc->>'unit_text' IS NOT NULL AND char_length(v_proc->>'unit_text') > 100 THEN
      RAISE EXCEPTION 'unit_text_too_long' USING ERRCODE = '22001';
    END IF;
    IF v_proc->>'note' IS NOT NULL AND char_length(v_proc->>'note') > 500 THEN
      RAISE EXCEPTION 'procedure_note_too_long' USING ERRCODE = '22001';
    END IF;

    INSERT INTO public.diary_procedures (
      diary_id, procedure_ko, tag_dict_ko, unit_text, price, note, sort_order
    ) VALUES (
      v_diary_id,
      v_proc->>'procedure_ko',
      -- FK 위반 방지: 사전에 없는 태그는 NULL(자유 입력 시술명은 procedure_ko 에 보존)
      (SELECT t.ko FROM public.tag_dictionary t WHERE t.ko = NULLIF(v_proc->>'tag_dict_ko', '')),
      NULLIF(v_proc->>'unit_text', ''),
      -- price 상한 2,000,000,000 (integer overflow 방지 — 검수 치명-3, bigint 경유 검증)
      CASE WHEN (v_proc->>'price') ~ '^\d{1,10}$'
                AND (v_proc->>'price')::bigint <= 2000000000
           THEN (v_proc->>'price')::integer
           ELSE NULL END,
      NULLIF(v_proc->>'note', ''),
      COALESCE((v_proc->>'sort_order')::smallint, v_idx::smallint)
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 9. 회원에게 도착 알림(§8.3 확정 문구, pref 존중)
  IF public.is_notification_enabled(v_link.profile_id, 'clinic_visit_added') THEN
    INSERT INTO public.notifications (recipient_id, kind, actor_id, message, url)
    VALUES (
      v_link.profile_id, 'clinic_visit_added', NULL,
      '새 시술노트가 도착했어요. 눌러서 확인하세요.',
      '/notes/' || v_diary_id::text
    );
  END IF;

  RETURN v_diary_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clinic_update_visit(p_clinic_profile_id uuid, p_diary_id bigint, p_visited_on date, p_procedures jsonb, p_doctor_id uuid DEFAULT NULL::uuid, p_doctor_name text DEFAULT NULL::text, p_manager_name text DEFAULT NULL::text, p_diary_body text DEFAULT NULL::text, p_total_price integer DEFAULT NULL::integer, p_next_appointment_date date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id   bigint;
  v_diary       record;
  v_link_status text;
  v_doctor_name text;
  v_proc        jsonb;
  v_idx         int := 0;
  v_proc_count  int;
BEGIN
  -- 1. 병원 명함 검증
  SELECT p.clinic_id INTO v_clinic_id
  FROM public.profiles p
  WHERE p.id = p_clinic_profile_id
    AND p.auth_user_id = auth.uid()
    AND p.role = 'clinic'
    AND p.clinic_id IS NOT NULL
    AND p.deleted_at IS NULL;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized_clinic' USING ERRCODE = '42501';
  END IF;

  -- 2. diary 소유 경계 — source='clinic' AND clinic_id=자기(횡단 차단). FOR UPDATE 로 동시 삭제와 직렬화.
  SELECT d.id, d.profile_id INTO v_diary
  FROM public.diaries d
  WHERE d.id = p_diary_id
    AND d.source = 'clinic'
    AND d.clinic_id = v_clinic_id
  FOR UPDATE;
  IF v_diary.id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found' USING ERRCODE = '22023';
  END IF;

  -- 3. 그 diary 소유 회원의 연결 상태 — active 만 수정 허용(revoked/rejected 차단 C2).
  --    FOR UPDATE 로 동시 revoke 와 직렬화. 3중 경계의 profile_id 축은 이 연결 조회로 확정.
  SELECT l.status INTO v_link_status
  FROM public.clinic_member_links l
  WHERE l.clinic_id = v_clinic_id
    AND l.profile_id = v_diary.profile_id
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_link_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'link_revoked' USING ERRCODE = '22023';
  END IF;

  -- 4. 후기 달린 노트는 수정 차단(§4.2-8 · C5 대칭) — diary_procedures 전체 교체가
  --    procedure_reviews.diary_procedure_id(ON DELETE SET NULL, 0292)를 끊어 후기 시술연결 소실.
  IF EXISTS (
    SELECT 1 FROM public.procedure_reviews r WHERE r.visit_id = p_diary_id
  ) THEN
    RAISE EXCEPTION 'visit_has_linked_reviews' USING ERRCODE = '22023';
  END IF;

  -- 5. 입력 검증(clinic_add_visit 0345 동일)
  IF p_visited_on IS NULL OR p_visited_on > current_date OR p_visited_on < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'invalid_visited_on' USING ERRCODE = '22023';
  END IF;
  IF p_diary_body IS NOT NULL AND char_length(p_diary_body) > 400 THEN
    RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001';
  END IF;
  IF p_total_price IS NOT NULL AND (p_total_price < 0 OR p_total_price > 2000000000) THEN
    RAISE EXCEPTION 'invalid_total_price' USING ERRCODE = '22023';
  END IF;
  -- 다음 예약일: 방문일 이전 금지 + 오늘+5년 초과 미래 금지(0355 오타 방어)
  IF p_next_appointment_date IS NOT NULL
     AND (p_next_appointment_date < p_visited_on
          OR p_next_appointment_date > (current_date + interval '5 years')::date) THEN
    RAISE EXCEPTION 'invalid_next_appointment_date' USING ERRCODE = '22023';
  END IF;
  IF p_doctor_name IS NOT NULL AND char_length(p_doctor_name) > 100 THEN
    RAISE EXCEPTION 'invalid_doctor_name' USING ERRCODE = '22023';
  END IF;
  IF p_manager_name IS NOT NULL AND char_length(p_manager_name) > 100 THEN
    RAISE EXCEPTION 'invalid_manager_name' USING ERRCODE = '22023';
  END IF;

  IF p_procedures IS NULL OR jsonb_typeof(p_procedures) <> 'array' THEN
    RAISE EXCEPTION 'procedures_not_array' USING ERRCODE = '22023';
  END IF;
  v_proc_count := jsonb_array_length(p_procedures);
  IF v_proc_count < 1 OR v_proc_count > 20 THEN
    RAISE EXCEPTION 'invalid_procedures_count' USING ERRCODE = '22023';
  END IF;

  -- 6. 담당 원장 검증 — 자기 지점 재직 원장만(clinic_add_visit 계승). doctor_id 선택 시 이름 스냅샷 저장.
  IF p_doctor_id IS NOT NULL THEN
    SELECT d.name INTO v_doctor_name
    FROM public.doctors d
    WHERE d.id = p_doctor_id
      AND d.clinic_id = v_clinic_id
      AND d.is_affiliated;
    IF v_doctor_name IS NULL THEN
      RAISE EXCEPTION 'invalid_doctor' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_doctor_name := NULLIF(btrim(COALESCE(p_doctor_name, '')), '');
  END IF;

  -- 7. UPDATE — 가변 컬럼만. 불변 컬럼(source/clinic_id/profile_id/created_by_clinic_profile_id/
  --    linked_consent_at/created_at)은 SET 절에 포함하지 않음(§4.2 불변 컬럼 방어). updated_at 은 트리거 자동.
  UPDATE public.diaries SET
    visited_on            = p_visited_on,
    doctor_id             = p_doctor_id,
    doctor_name           = v_doctor_name,
    manager_name          = NULLIF(btrim(COALESCE(p_manager_name, '')), ''),
    diary_body            = NULLIF(p_diary_body, ''),
    total_price           = p_total_price,
    next_appointment_date = p_next_appointment_date
  WHERE id = p_diary_id;

  -- 8. diary_procedures 전체 교체(DELETE 후 재삽입). tag_dict FK 안전화·길이/상한 검증(clinic_add_visit 계승).
  --    4번 가드로 후기 연결이 없음이 보장되므로 자식행 삭제가 후기 시술연결을 끊지 않는다.
  DELETE FROM public.diary_procedures WHERE diary_id = p_diary_id;

  v_idx := 0;
  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    IF COALESCE(NULLIF(v_proc->>'procedure_ko', ''), '') = ''
       OR char_length(v_proc->>'procedure_ko') > 100 THEN
      RAISE EXCEPTION 'invalid_procedure_name' USING ERRCODE = '22023';
    END IF;
    IF v_proc->>'unit_text' IS NOT NULL AND char_length(v_proc->>'unit_text') > 100 THEN
      RAISE EXCEPTION 'unit_text_too_long' USING ERRCODE = '22001';
    END IF;
    IF v_proc->>'note' IS NOT NULL AND char_length(v_proc->>'note') > 500 THEN
      RAISE EXCEPTION 'procedure_note_too_long' USING ERRCODE = '22001';
    END IF;

    INSERT INTO public.diary_procedures (
      diary_id, procedure_ko, tag_dict_ko, unit_text, price, note, sort_order
    ) VALUES (
      p_diary_id,
      v_proc->>'procedure_ko',
      -- FK 위반 방지: 사전에 없는 태그는 NULL(자유 입력 시술명은 procedure_ko 에 보존)
      (SELECT t.ko FROM public.tag_dictionary t WHERE t.ko = NULLIF(v_proc->>'tag_dict_ko', '')),
      NULLIF(v_proc->>'unit_text', ''),
      -- price 상한 2,000,000,000(integer overflow 방지 — bigint 경유 검증, clinic_add_visit 계승)
      CASE WHEN (v_proc->>'price') ~ '^\d{1,10}$'
                AND (v_proc->>'price')::bigint <= 2000000000
           THEN (v_proc->>'price')::integer
           ELSE NULL END,
      NULLIF(v_proc->>'note', ''),
      COALESCE((v_proc->>'sort_order')::smallint, v_idx::smallint)
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 알림 미발송(C13) — 수정은 회원에게 알리지 않는다.
  RETURN p_diary_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_doctor_profile(p_source_profile_id uuid, p_slug text, p_name text, p_clinic text DEFAULT NULL::text, p_branch text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_clinic_id bigint DEFAULT NULL::bigint, p_is_listed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
