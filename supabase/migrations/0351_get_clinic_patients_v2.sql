-- 0351_get_clinic_patients_v2.sql
-- 병원 운영 프로그램 S1 (DB 토대) — get_clinic_patients v2(환자 목록/검색·정렬·필터·집계).
-- 계획 SSOT: docs/plans/260706 병원 운영 프로그램 (환자·시술기록 관리) 설계.md §2.3 · §4.2
--
-- 반영 항목(§4.2):
--   [치명1] RETURNS TABLE 컬럼 추가(last_visit_on·visit_count·age_years)는 CREATE OR REPLACE 불가
--           (cannot change return type). → 맨 앞 DROP FUNCTION IF EXISTS ...(uuid, text) 후 재생성.
--           실측 기존 시그니처 = get_clinic_patients(p_clinic_profile_id uuid, p_search text).
--           ⚠ 동시 갱신 필수(S2): ClinicPatientItem(TS)·/api/clinic/patients 라우트(sort/dir/status/
--             limit/offset 수신→RPC 전달)·소비 파일 한 배치.
--   [중요5] 동적 ORDER BY 화이트리스트(CASE) + p_sort_dir IN('asc','desc') RAISE 검증.
--           patient_name COLLATE "ko-x-icu"(운영 DB collation 존재 확인).
--   [중요6] 생일 검색 = 클라 파싱 우선. 완전한 생일은 클라가 DATE 로 파싱→p_birthdate 로 전달→
--           patient_birthdate = p_birthdate 동등비교(인덱스 활용). to_char ILIKE 금지(seq scan·
--           2자리연도 모호). 부분·이름·등록번호·핸들은 p_search ILIKE.
--   [중요9] 집계 서브쿼리에 clinic_id=자기 필수(타 병원 노트 혼입 방지) + source='clinic'.
--
-- 설계 원칙: 0345 표준 패턴 계승(병원 명함 검증·search_path·REVOKE/GRANT·ILIKE 이스케이프).
--   기존 13 반환컬럼(link_id·status·member_handle·patient_name·patient_birthdate·patient_email·
--   patient_phone·patient_address·registration_number·patient_skin_profile·consent_at·created_at·
--   revoked_at)은 순서·이름 보존 + 신규 3컬럼(last_visit_on·visit_count·age_years) 말미 추가.

-- (치명1) 반환타입 변경 불가 → 정확한 인자 시그니처로 DROP 후 재생성.
DROP FUNCTION IF EXISTS public.get_clinic_patients(uuid, text);

CREATE OR REPLACE FUNCTION public.get_clinic_patients(
  p_clinic_profile_id uuid,
  p_search            text DEFAULT NULL,
  p_birthdate         date DEFAULT NULL,
  p_status_filter     text DEFAULT NULL,
  p_sort_by           text DEFAULT 'created_at',
  p_sort_dir          text DEFAULT 'desc',
  p_limit             int  DEFAULT 50,
  p_offset            int  DEFAULT 0
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
  revoked_at           timestamptz,
  last_visit_on        date,     -- 신규(§4.2-9): 그 환자 clinic 노트 max(visited_on)
  visit_count          bigint,   -- 신규(§4.2-9): 그 환자 clinic 노트 건수
  age_years            int       -- 신규: patient_birthdate 파생 만 나이
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
  -- 1. 병원 명함 검증(0345 패턴)
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
  IF p_sort_by NOT IN ('created_at', 'patient_name', 'last_visit_on', 'visit_count', 'status', 'patient_birthdate') THEN
    RAISE EXCEPTION 'invalid_sort_by' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(p_sort_dir, 'desc')) NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'invalid_sort_dir' USING ERRCODE = '22023';
  END IF;

  -- 3. 상태 필터 검증(값이면 status 도메인 내여야 함)
  IF p_status_filter IS NOT NULL
     AND p_status_filter NOT IN ('pending', 'active', 'rejected', 'revoked') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  -- 4. limit/offset 경계 정리
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- 5. 검색어 ILIKE 와일드카드 이스케이프(0345 계승) — 이름·등록번호·핸들 부분 검색.
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  IF v_q IS NOT NULL THEN
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.status, pr.handle,
    l.patient_name, l.patient_birthdate, l.patient_email,
    l.patient_phone, l.patient_address, l.registration_number,
    l.patient_skin_profile, l.consent_at, l.created_at, l.revoked_at,
    agg.last_visit_on,
    COALESCE(agg.visit_count, 0) AS visit_count,
    -- 만 나이: 생일 없으면 NULL
    CASE WHEN l.patient_birthdate IS NOT NULL
         THEN date_part('year', age(l.patient_birthdate))::int
         ELSE NULL END AS age_years
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles pr ON pr.id = l.profile_id
  -- 집계(§4.2-9): clinic_id 필수(타 병원 노트 혼입 방지) + source='clinic'.
  LEFT JOIN LATERAL (
    SELECT max(d.visited_on) AS last_visit_on, count(*)::bigint AS visit_count
    FROM public.diaries d
    WHERE d.profile_id = l.profile_id
      AND d.clinic_id = v_clinic_id
      AND d.source = 'clinic'
  ) agg ON true
  WHERE l.clinic_id = v_clinic_id
    -- 생일: 완전한 날짜는 클라가 파싱해 p_birthdate 로 전달 → 동등비교(§4.2-6, 인덱스 활용).
    AND (p_birthdate IS NULL OR l.patient_birthdate = p_birthdate)
    -- 상태 필터: NULL=전체.
    AND (p_status_filter IS NULL OR l.status = p_status_filter)
    -- 부분 검색: 이름·등록번호·핸들 ILIKE.
    AND (
      v_q IS NULL
      OR l.patient_name ILIKE '%' || v_q || '%'
      OR l.registration_number ILIKE '%' || v_q || '%'
      OR pr.handle ILIKE '%' || v_q || '%'
    )
  ORDER BY
    -- 화이트리스트로 검증된 컬럼만 CASE 분기(동적 SQL 미사용).
    CASE WHEN p_sort_by = 'patient_name' AND lower(p_sort_dir) = 'asc'
         THEN l.patient_name COLLATE "ko-x-icu" END ASC,
    CASE WHEN p_sort_by = 'patient_name' AND lower(p_sort_dir) = 'desc'
         THEN l.patient_name COLLATE "ko-x-icu" END DESC,
    CASE WHEN p_sort_by = 'status' AND lower(p_sort_dir) = 'asc'
         THEN l.status END ASC,
    CASE WHEN p_sort_by = 'status' AND lower(p_sort_dir) = 'desc'
         THEN l.status END DESC,
    CASE WHEN p_sort_by = 'patient_birthdate' AND lower(p_sort_dir) = 'asc'
         THEN l.patient_birthdate END ASC,
    CASE WHEN p_sort_by = 'patient_birthdate' AND lower(p_sort_dir) = 'desc'
         THEN l.patient_birthdate END DESC,
    CASE WHEN p_sort_by = 'last_visit_on' AND lower(p_sort_dir) = 'asc'
         THEN agg.last_visit_on END ASC,
    CASE WHEN p_sort_by = 'last_visit_on' AND lower(p_sort_dir) = 'desc'
         THEN agg.last_visit_on END DESC,
    CASE WHEN p_sort_by = 'visit_count' AND lower(p_sort_dir) = 'asc'
         THEN COALESCE(agg.visit_count, 0) END ASC,
    CASE WHEN p_sort_by = 'visit_count' AND lower(p_sort_dir) = 'desc'
         THEN COALESCE(agg.visit_count, 0) END DESC,
    CASE WHEN p_sort_by = 'created_at' AND lower(p_sort_dir) = 'asc'
         THEN l.created_at END ASC,
    CASE WHEN p_sort_by = 'created_at' AND lower(p_sort_dir) = 'desc'
         THEN l.created_at END DESC,
    l.id DESC   -- 안정 정렬 tie-breaker
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_patients(uuid, text, date, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_patients(uuid, text, date, text, text, text, int, int) TO authenticated;
