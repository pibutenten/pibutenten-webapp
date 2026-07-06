-- 0345_clinic_rpcs.sql
-- 병원 계정 시술노트 대행 RPC 9종 + is_notification_enabled clinic 확장
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §6
-- 디비전문가 검수 반영(2026-07-06): 치명 4건(FOR UPDATE·배열검증·price상한·unit_text) +
--   중요(생일검증·consent_version 서버고정·rate버킷 clinic_id·ILIKE 이스케이프) 반영.
--
-- 설계 원칙:
--  * 모든 함수 SECURITY DEFINER + SET search_path 'public','pg_temp' (기존 0279/0297 계승).
--  * 호출자 명함 검증 = p_*_profile_id 파라미터 + auth.uid() 대조(create_diary 0279 계승).
--    is_clinic()(GUC 헤더 의존)은 RLS 용으로 두고, RPC 는 파라미터 방식으로 통일.
--  * clinic_member_links 는 직접 GRANT 없음(0344) — 본 RPC 만 owner 권한으로 접근.
--    → 회원이 자기 연결을 볼 회원측 조회 RPC 2종(member_get/list_clinic_links)도 여기서 제공
--      (동의 화면 §8.3 · 연결관리 화면의 유일한 데이터 경로).
--  * 알림: message(한글 평문)+url 직접 조립(diaries 는 카드가 아니라 card_public_url 미사용, 0300 계승).
--    actor_id NULL(병원 계정 아바타/이름 비표시 — 병원 표시명은 message 에만).
--  * 열거 공격 방지: clinic_request_link 는 회원 없음/생일 불일치를 동일 에러(match_failed)로 반환.
--  * requested_legal_name/requested_birthdate 는 감사용 — 병원측 get_* 반환 금지(§5.4).
--    단 회원 본인(member_get_clinic_link)에게는 requested_legal_name 표시(§4.1 "회원이 동의 화면에서 본인 확인").
--  * diaries.doctor_id 선택 시 doctor_name 에도 이름 스냅샷 저장 — 계획 §5.3("자유입력 시만")과
--    다른 의도적 정정: /notes 뷰가 doctor_name 만 렌더(하위호환) + "과거 기록 불변"(개명·이동 무관).
--  * 시술노트 삭제: 계획 §6.7 의 member_delete_clinic_visit 은 만들지 않는다 — 기존
--    delete_visit(0297)이 소유검증+연결후기 standalone 전환+트랙A 예약 cancel 까지 이미 완전
--    처리하며 source='clinic' 노트(소유=회원)에도 그대로 적용됨(중복 로직 금지 원칙).
--  * 시그니처 정정(계획 §6 대비): p_note 제거(시술별 note 는 p_procedures 항목 안),
--    p_total_price 추가(DiaryForm 금액 §8.2), 모든 함수에 호출자 명함 파라미터 추가,
--    consent_version 은 클라이언트 주입 차단 위해 서버 상수 고정(파라미터 제거).

-- ============================================================
-- 0. is_notification_enabled — clinic 2종 분기 추가 (0242 CREATE OR REPLACE)
--    search_path 는 pg_temp 포함으로 강화(shadow 차단), 기존 분기·시그니처 보존.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_notification_enabled(p_profile uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    CASE p_kind
      WHEN 'comment'             THEN np.pref_comment
      WHEN 'reply'               THEN np.pref_reply
      WHEN 'like'                THEN np.pref_like
      WHEN 'save'                THEN np.pref_save
      WHEN 'review_request'      THEN np.pref_review_request
      WHEN 'published'           THEN np.pref_published
      WHEN 'follow_post'         THEN np.pref_follow_post
      WHEN 'clinic_link_request' THEN np.pref_clinic_link_request
      WHEN 'clinic_visit_added'  THEN np.pref_clinic_visit_added
      ELSE true
    END,
    true
  )
  FROM (SELECT 1) dummy
  LEFT JOIN public.notification_preferences np ON np.profile_id = p_profile;
$$;

-- ============================================================
-- 1. clinic_request_link — 병원: 회원 등록 요청 (대조 → pending + 알림)
-- ============================================================
CREATE OR REPLACE FUNCTION public.clinic_request_link(
  p_clinic_profile_id   uuid,
  p_handle              text,
  p_legal_name          text,
  p_birthdate           date,
  p_registration_number text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id    bigint;
  v_clinic_name  text;
  v_member_id    uuid;
  v_existing     record;
  v_link_id      bigint;
BEGIN
  -- 1. 병원 명함 검증(호출자 소유 + role=clinic + 소속 지점)
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

  -- 2. rate-limit — 지점(clinic_id) 단위(명함 다중화 우회 차단), 분당 10회(열거 공격 방지)
  IF NOT public.check_and_increment_rate_limit(
    'clinic_request_link:' || v_clinic_id::text, 10, 60
  ) THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = '54000';
  END IF;

  -- 3. 입력 검증
  IF p_handle IS NULL OR btrim(p_handle) = '' THEN
    RAISE EXCEPTION 'invalid_handle' USING ERRCODE = '22023';
  END IF;
  IF p_legal_name IS NULL OR char_length(btrim(p_legal_name)) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_legal_name' USING ERRCODE = '22023';
  END IF;
  IF p_birthdate IS NULL OR p_birthdate > current_date OR p_birthdate < DATE '1900-01-01' THEN
    RAISE EXCEPTION 'invalid_birthdate' USING ERRCODE = '22023';
  END IF;
  IF p_registration_number IS NOT NULL AND char_length(p_registration_number) > 100 THEN
    RAISE EXCEPTION 'invalid_registration_number' USING ERRCODE = '22023';
  END IF;

  -- 4. 회원 대조 — handle(고유) + 생일 하드키(§4.1). 실패 사유 비구분(열거 방지).
  SELECT p.id INTO v_member_id
  FROM public.profiles p
  WHERE p.handle = lower(btrim(p_handle))
    AND p.deleted_at IS NULL
    AND p.role <> 'clinic'
    AND p.birthdate = p_birthdate;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'match_failed' USING ERRCODE = '22023';
  END IF;

  -- 5. 기존 연결 확인(pending/active 는 부분 UNIQUE 로도 차단 — 친절 에러 선반환)
  SELECT l.id, l.status INTO v_existing
  FROM public.clinic_member_links l
  WHERE l.clinic_id = v_clinic_id
    AND l.profile_id = v_member_id
    AND l.status IN ('pending', 'active')
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'link_already_pending' USING ERRCODE = '22023';
    ELSE
      RAISE EXCEPTION 'link_already_active' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. 연결 생성(pending). 실명·생일은 병원 입력값을 requested_*(감사)와 patient_*(병원 화면 표시) 둘 다에 저장(§4.1).
  --    SELECT-INSERT race 는 부분 UNIQUE(clinic_id, profile_id WHERE pending/active)가 최종 방어(23505).
  INSERT INTO public.clinic_member_links (
    clinic_id, profile_id, status, created_by_clinic_profile_id,
    requested_legal_name, requested_birthdate, registration_number,
    patient_name, patient_birthdate
  ) VALUES (
    v_clinic_id, v_member_id, 'pending', p_clinic_profile_id,
    btrim(p_legal_name), p_birthdate, NULLIF(btrim(COALESCE(p_registration_number, '')), ''),
    btrim(p_legal_name), p_birthdate
  ) RETURNING id INTO v_link_id;

  -- 7. 회원에게 동의 요청 알림(§8.3 확정 문구, pref 존중)
  IF public.is_notification_enabled(v_member_id, 'clinic_link_request') THEN
    INSERT INTO public.notifications (recipient_id, kind, actor_id, message, url)
    VALUES (
      v_member_id, 'clinic_link_request', NULL,
      v_clinic_name || '이 시술노트 연결을 요청했어요. 눌러서 확인하세요.',
      '/onboarding/clinic-link/' || v_link_id::text
    );
  END IF;

  RETURN v_link_id;
EXCEPTION
  WHEN unique_violation THEN
    -- race 로 동시 INSERT 된 경우(부분 UNIQUE 23505) — 친절 에러로 변환
    RAISE EXCEPTION 'link_already_pending' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_request_link(uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_request_link(uuid, text, text, date, text) TO authenticated;

-- ============================================================
-- 2. member_respond_link — 회원: 동의/거절 (+동의 시 스냅샷 복사, §4.2)
--    consent_version 은 서버 상수(클라이언트 주입 차단 — 검수 중요-5).
--    구 5-파라미터 시그니처 방어적 DROP(재적용 멱등성 — 검수 치명-8).
-- ============================================================
DROP FUNCTION IF EXISTS public.member_respond_link(uuid, bigint, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.member_respond_link(
  p_profile_id          uuid,
  p_link_id             bigint,
  p_consent             boolean,
  p_backfill_legal_name boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_consent_version constant text := 'v1-260706';  -- 동의 문구 개정 시 함수 교체로 갱신
  v_link    record;
  v_member  record;
  v_email   text;
BEGIN
  -- 1. 회원 명함 검증
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  -- 2. 본인 수신 pending 연결 잠금 조회
  SELECT * INTO v_link
  FROM public.clinic_member_links
  WHERE id = p_link_id AND profile_id = p_profile_id
  FOR UPDATE;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_link.status <> 'pending' THEN
    RAISE EXCEPTION 'link_not_pending' USING ERRCODE = '22023';
  END IF;

  -- 3. 거절
  IF NOT p_consent THEN
    UPDATE public.clinic_member_links SET status = 'rejected' WHERE id = p_link_id;
    RETURN;
  END IF;

  -- 4. 동의 — 회원 정보 1회 스냅샷 복사(§0.7 라이브 아님, 이후 병원 수정)
  SELECT legal_name, birthdate, contact_email, gender, skin_type, skin_concerns,
         face_shape, fitzpatrick, interested_procedures
    INTO v_member
  FROM public.profiles WHERE id = p_profile_id;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();

  UPDATE public.clinic_member_links SET
    status            = 'active',
    consent_at        = now(),
    consent_version   = c_consent_version,
    -- 이름: 회원 실명(있으면) 우선, 없으면 병원 입력값 유지
    patient_name      = COALESCE(NULLIF(v_member.legal_name, ''), patient_name),
    patient_birthdate = COALESCE(v_member.birthdate, patient_birthdate),
    patient_email     = COALESCE(NULLIF(v_member.contact_email, ''), v_email),
    patient_skin_profile = jsonb_build_object(
      'gender',                v_member.gender,
      'skin_type',             v_member.skin_type,
      'skin_concerns',         v_member.skin_concerns,
      'face_shape',            v_member.face_shape,
      'fitzpatrick',           v_member.fitzpatrick,
      'interested_procedures', v_member.interested_procedures
    )
  WHERE id = p_link_id;

  -- 5. (선택) 병원 입력 실명을 내 프로필에 저장 — legal_name 비어있을 때만(§C 선택 복원)
  IF p_backfill_legal_name
     AND v_link.requested_legal_name IS NOT NULL
     AND (v_member.legal_name IS NULL OR v_member.legal_name = '') THEN
    UPDATE public.profiles
    SET legal_name = v_link.requested_legal_name
    WHERE id = p_profile_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.member_respond_link(uuid, bigint, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_respond_link(uuid, bigint, boolean, boolean) TO authenticated;

-- ============================================================
-- 3. clinic_add_visit — 병원: 시술노트 대행 작성 (active 필수, §4.2-3)
--    visited_on_precision 은 'exact' 고정 — 병원은 시술 당일·실기록 기준 입력(의도적 단순화).
-- ============================================================
CREATE OR REPLACE FUNCTION public.clinic_add_visit(
  p_clinic_profile_id     uuid,
  p_link_id               bigint,
  p_visited_on            date,
  p_procedures            jsonb,
  p_doctor_id             uuid    DEFAULT NULL,
  p_doctor_name           text    DEFAULT NULL,
  p_manager_name          text    DEFAULT NULL,
  p_diary_body            text    DEFAULT NULL,
  p_total_price           integer DEFAULT NULL,
  p_next_appointment_date date    DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
  IF p_next_appointment_date IS NOT NULL AND p_next_appointment_date < p_visited_on THEN
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
$$;

REVOKE ALL ON FUNCTION public.clinic_add_visit(uuid, bigint, date, jsonb, uuid, text, text, text, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_add_visit(uuid, bigint, date, jsonb, uuid, text, text, text, integer, date) TO authenticated;

-- ============================================================
-- 4. clinic_update_patient — 병원: 환자 기록 수정 (전체 교체 방식)
--    requested_*(감사값)는 불변. 스냅샷은 병원 수정 가능(§0.7).
--    pending 수정 허용(병원 자체 항목 정정 필요) — 스냅샷 필드는 동의 시 회원 원본으로 덮임.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clinic_update_patient(
  p_clinic_profile_id   uuid,
  p_link_id             bigint,
  p_registration_number text  DEFAULT NULL,
  p_patient_phone       text  DEFAULT NULL,
  p_patient_address     text  DEFAULT NULL,
  p_patient_name        text  DEFAULT NULL,
  p_patient_birthdate   date  DEFAULT NULL,
  p_patient_email       text  DEFAULT NULL,
  p_patient_skin_profile jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
  v_status    text;
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

  -- 2. 입력 검증
  IF p_registration_number IS NOT NULL AND char_length(p_registration_number) > 100 THEN
    RAISE EXCEPTION 'invalid_registration_number' USING ERRCODE = '22023';
  END IF;
  IF p_patient_phone IS NOT NULL AND char_length(p_patient_phone) > 50 THEN
    RAISE EXCEPTION 'invalid_patient_phone' USING ERRCODE = '22023';
  END IF;
  IF p_patient_address IS NOT NULL AND char_length(p_patient_address) > 200 THEN
    RAISE EXCEPTION 'invalid_patient_address' USING ERRCODE = '22023';
  END IF;
  IF p_patient_name IS NOT NULL AND char_length(p_patient_name) > 50 THEN
    RAISE EXCEPTION 'invalid_patient_name' USING ERRCODE = '22023';
  END IF;
  IF p_patient_birthdate IS NOT NULL AND
     (p_patient_birthdate > current_date OR p_patient_birthdate < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'invalid_patient_birthdate' USING ERRCODE = '22023';
  END IF;
  IF p_patient_email IS NOT NULL AND char_length(p_patient_email) > 320 THEN
    RAISE EXCEPTION 'invalid_patient_email' USING ERRCODE = '22023';
  END IF;

  -- 3. 자기 지점 연결(해지·거절 제외)만 수정
  SELECT l.status INTO v_status
  FROM public.clinic_member_links l
  WHERE l.id = p_link_id AND l.clinic_id = v_clinic_id
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_status IN ('rejected', 'revoked') THEN
    RAISE EXCEPTION 'link_not_editable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinic_member_links SET
    registration_number  = NULLIF(btrim(COALESCE(p_registration_number, '')), ''),
    patient_phone        = NULLIF(btrim(COALESCE(p_patient_phone, '')), ''),
    patient_address      = NULLIF(btrim(COALESCE(p_patient_address, '')), ''),
    patient_name         = NULLIF(btrim(COALESCE(p_patient_name, '')), ''),
    patient_birthdate    = p_patient_birthdate,
    patient_email        = NULLIF(btrim(COALESCE(p_patient_email, '')), ''),
    patient_skin_profile = p_patient_skin_profile
  WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_update_patient(uuid, bigint, text, text, text, text, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_update_patient(uuid, bigint, text, text, text, text, date, text, jsonb) TO authenticated;

-- ============================================================
-- 5. get_clinic_patients — 병원: 환자 목록/검색
--    requested_legal_name/requested_birthdate 반환 금지(§5.4 감사 전용).
--    p_search 는 ILIKE 와일드카드 이스케이프(검수 중요-7).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_patients(
  p_clinic_profile_id uuid,
  p_search            text DEFAULT NULL
)
RETURNS TABLE (
  link_id              bigint,
  status               text,
  member_handle        text,
  patient_name         text,
  patient_birthdate    date,
  patient_email        text,
  patient_phone        text,
  patient_address      text,
  registration_number  text,
  patient_skin_profile jsonb,
  consent_at           timestamptz,
  created_at           timestamptz,
  revoked_at           timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
  v_q         text;
BEGIN
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

  -- ILIKE 와일드카드 이스케이프(%·_·\)
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.status, pr.handle,
    l.patient_name, l.patient_birthdate, l.patient_email,
    l.patient_phone, l.patient_address, l.registration_number,
    l.patient_skin_profile, l.consent_at, l.created_at, l.revoked_at
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles pr ON pr.id = l.profile_id
  WHERE l.clinic_id = v_clinic_id
    AND (
      v_q IS NULL
      OR l.patient_name ILIKE '%' || v_q || '%'
      OR l.registration_number ILIKE '%' || v_q || '%'
      OR pr.handle ILIKE '%' || v_q || '%'
    )
  ORDER BY l.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_patients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_patients(uuid, text) TO authenticated;

-- ============================================================
-- 6. get_clinic_patient — 병원: 환자 상세 1건
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_patient(
  p_clinic_profile_id uuid,
  p_link_id           bigint
)
RETURNS TABLE (
  link_id              bigint,
  status               text,
  member_handle        text,
  patient_name         text,
  patient_birthdate    date,
  patient_email        text,
  patient_phone        text,
  patient_address      text,
  registration_number  text,
  patient_skin_profile jsonb,
  consent_at           timestamptz,
  created_at           timestamptz,
  revoked_at           timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
BEGIN
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

  RETURN QUERY
  SELECT
    l.id, l.status, pr.handle,
    l.patient_name, l.patient_birthdate, l.patient_email,
    l.patient_phone, l.patient_address, l.registration_number,
    l.patient_skin_profile, l.consent_at, l.created_at, l.revoked_at
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles pr ON pr.id = l.profile_id
  WHERE l.id = p_link_id AND l.clinic_id = v_clinic_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_patient(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_patient(uuid, bigint) TO authenticated;

-- ============================================================
-- 7. member_get_clinic_link — 회원: 동의 화면용 연결 1건 조회 (§8.3)
--    본인 수신 링크만. 병원 표시명 + 병원 입력 실명(본인 확인용 §4.1) 포함.
--    clinic_member_links 직접 GRANT 없음 → 동의 화면의 유일한 데이터 경로.
-- ============================================================
CREATE OR REPLACE FUNCTION public.member_get_clinic_link(
  p_profile_id uuid,
  p_link_id    bigint
)
RETURNS TABLE (
  link_id              bigint,
  status               text,
  clinic_display_name  text,
  requested_legal_name text,
  consent_at           timestamptz,
  created_at           timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.status,
    COALESCE(NULLIF(cp.display_name, ''), '제휴 병원'),
    l.requested_legal_name,
    l.consent_at, l.created_at
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles cp ON cp.id = l.created_by_clinic_profile_id
  WHERE l.id = p_link_id AND l.profile_id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_get_clinic_link(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_get_clinic_link(uuid, bigint) TO authenticated;

-- ============================================================
-- 8. member_list_clinic_links — 회원: 연결 병원 관리 목록 (§8.3 /{handle} 아코디언)
-- ============================================================
CREATE OR REPLACE FUNCTION public.member_list_clinic_links(
  p_profile_id uuid
)
RETURNS TABLE (
  link_id             bigint,
  status              text,
  clinic_display_name text,
  consent_at          timestamptz,
  created_at          timestamptz,
  revoked_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.status,
    COALESCE(NULLIF(cp.display_name, ''), '제휴 병원'),
    l.consent_at, l.created_at, l.revoked_at
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles cp ON cp.id = l.created_by_clinic_profile_id
  WHERE l.profile_id = p_profile_id
  ORDER BY l.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.member_list_clinic_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_list_clinic_links(uuid) TO authenticated;

-- ============================================================
-- 9. member_revoke_clinic_link — 회원: 연결 해제 (active → revoked)
-- ============================================================
CREATE OR REPLACE FUNCTION public.member_revoke_clinic_link(
  p_profile_id uuid,
  p_link_id    bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  SELECT l.status INTO v_status
  FROM public.clinic_member_links l
  WHERE l.id = p_link_id AND l.profile_id = p_profile_id
  FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'link_not_active' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinic_member_links
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.member_revoke_clinic_link(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_revoke_clinic_link(uuid, bigint) TO authenticated;
