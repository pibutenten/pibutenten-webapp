-- 0350_clinic_visit_rpcs.sql
-- 병원 운영 프로그램 S1 (DB 토대) — 시술기록 관리 RPC 5종 + 인덱스 2종.
-- 계획 SSOT: docs/plans/260706 병원 운영 프로그램 (환자·시술기록 관리) 설계.md §4 · §4.2
--
-- 반영 항목(§4.2):
--   [치명3] clinic_update_visit·clinic_delete_visit 신규 — 3중 소유검증
--           (source='clinic' AND clinic_id=자기 AND profile_id=연결회원). profile_id 누락이 최빈 실수.
--           FOR UPDATE + status='active' 만 수정/작성(revoked 차단 C2). delete 는 후기 있으면 차단(C5).
--   [치명4] get_clinic_calendar_summary 신설 — 월 집계(GROUP BY visited_on)로 월 전체 행 전송 회피.
--   [중요5] 동적 ORDER BY 인젝션 차단 — p_sort_by/p_sort_dir CASE 화이트리스트 + dir RAISE 검증.
--           patient_name 은 COLLATE "ko-x-icu"(운영 DB collation 존재 확인: pg_collation 'ko-x-icu', provider 'i').
--   [중요8] 후기 달린 clinic 노트 = 병원 수정도 차단(visit_has_linked_reviews) — diary_procedures 전체
--           교체가 procedure_reviews.diary_procedure_id(ON DELETE SET NULL, 0292)를 끊어 후기 시술연결
--           소실. C5(삭제 차단)와 대칭으로 수정도 차단.
--   [중요11] 대장 기간 = visited_on(시술일) 범위 p_from~p_to(하루/한주/한달/전체). 대시보드(0349)의
--            '오늘/이번 달'은 created_at(작성일) 기준 — 의미 다름(주석 명시).
--   [중요12] REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated · search_path 고정 · SECURITY DEFINER
--            · 한글 RAISE 는 UTF-8 경로(scratchpad/db.mjs)로 적용 · U+FFFD 0 재스캔.
--            keyset 커서(p_after_*)는 1차 미도입(offset 페이지네이션). ROADMAP 예약.
--
-- 설계 원칙(0345 표준 패턴 계승):
--   * 모든 함수 SECURITY DEFINER + SET search_path 'public','pg_temp'.
--   * 병원 명함 검증 = p_clinic_profile_id 파라미터 + auth.uid() 대조 + role='clinic'
--     + clinic_id IS NOT NULL + deleted_at IS NULL (0345 clinic_add_visit 계승).
--   * clinic_member_links / diaries 는 직접 GRANT 없음(0344/0278 RLS) — 본 RPC 만 owner 권한 접근.
--   * 에러코드 관례(0345): 42501 미인가 · 22023 잘못된 인자 · 22001 길이초과.
--   * revoked 도 과거 기록 '조회'는 허용(C2 — 조회 허용·수정만 차단). get_* 조회 RPC 는 status 무관.
--
-- 운영 DB 실측(2026-07-06, 조회만·적용 없음):
--   * ko-x-icu collation 존재(provider 'i').
--   * procedure_reviews.visit_id → diaries(id) FK(procedure_reviews_visit_id_fkey, ON DELETE SET NULL).
--     → '후기 존재' 판정 = procedure_reviews WHERE visit_id = p_diary_id.
--   * diary_procedures 는 updated_at 없음 — 전체 교체는 DELETE 후 재삽입.
--   * scheduled_notification(recipient_id, kind, visit_id, review_id, status, ...) — delete_visit 정리 대상.
--   * 기존 diaries_clinic_idx = clinic_id 부분 인덱스(집계용). 신규 대장 정렬 인덱스와 목적 분리.

-- ============================================================
-- 1. get_clinic_patient_visits — 환자 1명의 시술기록 타임라인 + procedures
--    보안: source='clinic' AND clinic_id=자기 AND profile_id=연결회원(3중, profile_id 필수).
--    status 무관 조회 허용(revoked 도 과거 기록 조회 — C2).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_patient_visits(
  p_clinic_profile_id uuid,
  p_link_id           bigint
)
RETURNS TABLE (
  diary_id              bigint,
  visited_on            date,
  visited_on_precision  text,
  doctor_name           text,
  doctor_id             uuid,
  manager_name          text,
  diary_body            text,
  total_price           integer,
  next_appointment_date date,
  created_at            timestamptz,
  updated_at            timestamptz,
  procedures            jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id  bigint;
  v_profile_id uuid;
BEGIN
  -- 1. 병원 명함 검증(호출자 소유 + role=clinic + 소속 지점)
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

  -- 2. link 의 회원(profile_id) 확보 — 자기 지점 소유 연결만(횡단 차단). status 무관(조회는 revoked 도 허용).
  SELECT l.profile_id INTO v_profile_id
  FROM public.clinic_member_links l
  WHERE l.id = p_link_id AND l.clinic_id = v_clinic_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = '22023';
  END IF;

  -- 3. 3중 소유 경계 diaries 조회. procedures = 자식행 sort_order 순 jsonb_agg.
  RETURN QUERY
  SELECT
    d.id, d.visited_on, d.visited_on_precision,
    d.doctor_name, d.doctor_id, d.manager_name, d.diary_body,
    d.total_price, d.next_appointment_date, d.created_at, d.updated_at,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object(
                  'id',           dp.id,
                  'procedure_ko', dp.procedure_ko,
                  'tag_dict_ko',  dp.tag_dict_ko,
                  'unit_text',    dp.unit_text,
                  'price',        dp.price,
                  'note',         dp.note,
                  'sort_order',   dp.sort_order
                ) ORDER BY dp.sort_order, dp.id)
         FROM public.diary_procedures dp
        WHERE dp.diary_id = d.id),
      '[]'::jsonb
    ) AS procedures
  FROM public.diaries d
  WHERE d.source = 'clinic'
    AND d.clinic_id = v_clinic_id
    AND d.profile_id = v_profile_id   -- profile_id 필수(3중, §4.2 치명3)
  ORDER BY d.visited_on DESC, d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_patient_visits(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_patient_visits(uuid, bigint) TO authenticated;

-- ============================================================
-- 2. get_clinic_visits — 지점 전체 시술기록 대장(§2.5)
--    보안: source='clinic' AND clinic_id=자기. 기간 = visited_on 범위(§4.2-11).
--    동적 정렬 CASE 화이트리스트(§4.2-5). status 무관(revoked 기록도 대장에 조회).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_visits(
  p_clinic_profile_id uuid,
  p_search            text    DEFAULT NULL,
  p_doctor_id         uuid    DEFAULT NULL,
  p_from              date    DEFAULT NULL,
  p_to                date    DEFAULT NULL,
  p_sort_by           text    DEFAULT 'visited_on',
  p_sort_dir          text    DEFAULT 'desc',
  p_limit             int     DEFAULT 50,
  p_offset            int     DEFAULT 0
)
RETURNS TABLE (
  diary_id              bigint,
  visited_on            date,
  link_id               bigint,
  patient_name          text,
  member_handle         text,
  doctor_name           text,
  total_price           integer,
  next_appointment_date date,
  procedures_summary    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
  v_q         text;
  v_limit     int;
  v_offset    int;
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

  -- 2. 정렬 화이트리스트 검증(인젝션 차단, §4.2-5)
  IF p_sort_by NOT IN ('visited_on', 'patient_name', 'total_price') THEN
    RAISE EXCEPTION 'invalid_sort_by' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(p_sort_dir, 'desc')) NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'invalid_sort_dir' USING ERRCODE = '22023';
  END IF;

  -- 3. limit/offset 경계 정리
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- 4. 검색어 ILIKE 와일드카드 이스케이프(0345 계승)
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.visited_on,
    l.id AS link_id,
    l.patient_name,
    pr.handle AS member_handle,
    d.doctor_name,
    d.total_price,
    d.next_appointment_date,
    -- 시술요약: 자식행 procedure_ko 를 sort_order 순 '·' 조인
    (SELECT string_agg(dp.procedure_ko, ' · ' ORDER BY dp.sort_order, dp.id)
       FROM public.diary_procedures dp
      WHERE dp.diary_id = d.id) AS procedures_summary
  FROM public.diaries d
  -- 대장 표시용 link(같은 지점·같은 회원). 비귀속 다대다라도 (clinic_id, profile_id) pending/active 는
  -- 부분 UNIQUE(0344)로 최대 1건 — 다행 조인 위험 없음. revoked/rejected 다건 대비 최신 1건만.
  LEFT JOIN LATERAL (
    SELECT l2.id, l2.patient_name
    FROM public.clinic_member_links l2
    WHERE l2.clinic_id = v_clinic_id
      AND l2.profile_id = d.profile_id
    ORDER BY (l2.status IN ('pending','active')) DESC, l2.created_at DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN public.profiles pr ON pr.id = d.profile_id
  WHERE d.source = 'clinic'
    AND d.clinic_id = v_clinic_id
    -- 기간: visited_on 범위(한쪽 NULL 허용, 둘 다 NULL=전체). §4.2-11.
    AND (p_from IS NULL OR d.visited_on >= p_from)
    AND (p_to   IS NULL OR d.visited_on <= p_to)
    -- 원장 필터
    AND (p_doctor_id IS NULL OR d.doctor_id = p_doctor_id)
    -- 검색: 환자명 · 시술명 ILIKE.
    -- COALESCE 로 방어: LATERAL link 미매칭(latent 고아 diary) 시 patient_name NULL → ILIKE false 로
    -- 검색 누락되는 것을 빈 문자열로 흡수(시술명 EXISTS 로는 여전히 매칭 가능).
    AND (
      v_q IS NULL
      OR COALESCE(l.patient_name, '') ILIKE '%' || v_q || '%'
      OR EXISTS (
        SELECT 1 FROM public.diary_procedures dp
        WHERE dp.diary_id = d.id
          AND dp.procedure_ko ILIKE '%' || v_q || '%'
      )
    )
  ORDER BY
    -- 화이트리스트로 이미 검증된 컬럼만 CASE 분기(동적 SQL 미사용).
    CASE WHEN p_sort_by = 'patient_name' AND lower(p_sort_dir) = 'asc'
         THEN l.patient_name COLLATE "ko-x-icu" END ASC,
    CASE WHEN p_sort_by = 'patient_name' AND lower(p_sort_dir) = 'desc'
         THEN l.patient_name COLLATE "ko-x-icu" END DESC,
    CASE WHEN p_sort_by = 'total_price' AND lower(p_sort_dir) = 'asc'
         THEN d.total_price END ASC,
    CASE WHEN p_sort_by = 'total_price' AND lower(p_sort_dir) = 'desc'
         THEN d.total_price END DESC,
    CASE WHEN p_sort_by = 'visited_on' AND lower(p_sort_dir) = 'asc'
         THEN d.visited_on END ASC,
    CASE WHEN p_sort_by = 'visited_on' AND lower(p_sort_dir) = 'desc'
         THEN d.visited_on END DESC,
    d.created_at DESC   -- 안정 정렬 tie-breaker(기본 visited_on DESC 보조)
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_visits(uuid, text, uuid, date, date, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_visits(uuid, text, uuid, date, date, text, text, int, int) TO authenticated;

-- ============================================================
-- 3. get_clinic_calendar_summary — 월간 캘린더 날짜별 기록 수(§4.2 치명4)
--    보안: source='clinic' AND clinic_id=자기. GROUP BY visited_on(월 전체 행 전송 회피).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_calendar_summary(
  p_clinic_profile_id uuid,
  p_year              int,
  p_month             int
)
RETURNS TABLE (
  visit_date  date,
  visit_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id bigint;
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

  -- 2. 인자 검증(make_date 예외 사전 차단)
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'invalid_year' USING ERRCODE = '22023';
  END IF;
  IF p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'invalid_month' USING ERRCODE = '22023';
  END IF;

  -- 3. 해당 월 날짜별 기록 수(방문일 기준).
  --    범위 비교(>= 1일, < 다음달 1일)로 diaries_clinic_visited_idx(clinic_id, visited_on) 활용
  --    (date_trunc(visited_on) 함수 래핑은 인덱스 미사용 — 검수 [제안-1] 반영).
  RETURN QUERY
  SELECT d.visited_on, count(*)::bigint
  FROM public.diaries d
  WHERE d.source = 'clinic'
    AND d.clinic_id = v_clinic_id
    AND d.visited_on >= make_date(p_year, p_month, 1)
    AND d.visited_on <  (make_date(p_year, p_month, 1) + interval '1 month')::date
  GROUP BY d.visited_on
  ORDER BY d.visited_on;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_calendar_summary(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_calendar_summary(uuid, int, int) TO authenticated;

-- ============================================================
-- 4. clinic_update_visit — 병원: 시술기록 수정(전체 교체)
--    3중 소유검증 + active 만(revoked 차단 C2) + 후기 있으면 수정 차단(§4.2-8).
--    불변 컬럼(source/clinic_id/profile_id/created_by_clinic_profile_id/linked_consent_at/created_at)은
--    파라미터로 아예 받지 않는다(§4.2 불변 컬럼 방어). 알림 미발송(C13).
-- ============================================================
CREATE OR REPLACE FUNCTION public.clinic_update_visit(
  p_clinic_profile_id     uuid,
  p_diary_id              bigint,
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
  IF p_next_appointment_date IS NOT NULL AND p_next_appointment_date < p_visited_on THEN
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
$$;

REVOKE ALL ON FUNCTION public.clinic_update_visit(uuid, bigint, date, jsonb, uuid, text, text, text, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_update_visit(uuid, bigint, date, jsonb, uuid, text, text, text, integer, date) TO authenticated;

-- ============================================================
-- 5. clinic_delete_visit — 병원: 시술기록 삭제
--    3중 소유검증(source='clinic' AND clinic_id=자기 — 타 지점 횡단 차단) + active 연결만(C2)
--    + 후기 있으면 차단(C5).
--    diary_procedures 는 diary_id CASCADE, scheduled_notification 은 visit_id 정리(delete_visit 0297 패턴).
--    알림 미발송. active 연결만 삭제 가능(C2 = revoked/rejected 시 병원은 조회만 — 수정·삭제 불가).
-- ============================================================
CREATE OR REPLACE FUNCTION public.clinic_delete_visit(
  p_clinic_profile_id uuid,
  p_diary_id          bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic_id   bigint;
  v_diary       record;
  v_link_status text;
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

  -- 2. diary 소유 경계 — source='clinic' AND clinic_id=자기(타 지점 횡단 차단). FOR UPDATE 로 직렬화.
  --    profile_id 도 확보 — 3번 연결 상태 검사(C2)의 회원 축.
  SELECT d.id, d.profile_id INTO v_diary
  FROM public.diaries d
  WHERE d.id = p_diary_id
    AND d.source = 'clinic'
    AND d.clinic_id = v_clinic_id
  FOR UPDATE;
  IF v_diary.id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found' USING ERRCODE = '22023';
  END IF;

  -- 3. 연결 상태 검사 — active 연결만 삭제 허용(C2 = revoked/rejected 시 병원은 조회만, 삭제 불가).
  --    clinic_update_visit 3번 블록과 동일 가드. FOR UPDATE 로 동시 revoke 와 직렬화.
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

  -- 4. 후기 달린 노트 삭제 차단(C5 고아 방지) — procedure_reviews.visit_id 존재 시.
  IF EXISTS (
    SELECT 1 FROM public.procedure_reviews r WHERE r.visit_id = p_diary_id
  ) THEN
    RAISE EXCEPTION 'visit_has_linked_reviews' USING ERRCODE = '22023';
  END IF;

  -- 5. 트랙A 잔여 예약 정리(delete_visit 0297 패턴) — 이 diary 에 걸린 pending scheduled_notification 을
  --    cancelled 로 보존 + visit_id 를 떼어 (6)의 visit_id CASCADE 대상에서 제외.
  --    (후기 0건이 4번 가드로 보장되므로 review_id 기반 트랙A 는 없으나, diary 직결 예약 방어.)
  UPDATE public.scheduled_notification s
     SET status = 'cancelled', visit_id = NULL
   WHERE s.visit_id = p_diary_id
     AND s.status = 'pending';

  -- 6. diary 삭제 — diary_procedures 는 diary_id CASCADE(0278), 잔여 scheduled_notification(visit_id 보유)은
  --    visit_id CASCADE. 후기 0건이라 FK SET NULL 발동 대상 없음.
  DELETE FROM public.diaries WHERE id = p_diary_id;

  -- 알림 미발송(C13).
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_delete_visit(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_delete_visit(uuid, bigint) TO authenticated;

-- ============================================================
-- 인덱스 2종(§4.2-7)
--   * diaries_clinic_visited_idx — 대장 정렬(clinic_id + visited_on DESC), source='clinic' 부분.
--     기존 diaries_clinic_idx(clinic_id 부분, 집계용)와 목적 분리 — 둘 다 유지.
--   * clinic_member_links_clinic_birthdate_idx — 생일 동등 검색(0351 get_clinic_patients v2 활용).
-- ============================================================
CREATE INDEX IF NOT EXISTS diaries_clinic_visited_idx
  ON public.diaries (clinic_id, visited_on DESC)
  WHERE source = 'clinic';

CREATE INDEX IF NOT EXISTS clinic_member_links_clinic_birthdate_idx
  ON public.clinic_member_links (clinic_id, patient_birthdate);
