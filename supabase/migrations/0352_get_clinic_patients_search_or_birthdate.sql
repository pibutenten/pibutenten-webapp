-- 0352_get_clinic_patients_search_or_birthdate.sql
-- get_clinic_patients 검색 정합성 정정 — 한 검색창에서 이름·등록번호·아이디·생일을 OR 로.
-- 계획 SSOT: docs/plans/260706 …관리 설계.md §2.3(단일 검색창: 등록번호·생일 790126·이름 다양 검색).
--
-- 배경(총괄 검수 발견): 0351 은 p_birthdate 를 별도 AND 필터로 걸어 "텍스트 검색 AND 생일"
--   동시 만족을 요구 → 한 창에서 "790126(생일)" 을 치면 이름 텍스트 검색과 충돌. 원장 요구는
--   "한 검색창에서 등록번호든 생일이든 이름이든 찾힘"(OR). → 검색 텍스트(v_q)와 생일(p_birthdate)을
--   OR 로 결합한다. 클라는 검색어 원문을 p_search 로, 그 원문이 완전한 생일로 파싱되면 p_birthdate
--   로도 함께 보낸다(둘 중 하나라도 매칭되면 노출).
--
-- 시그니처 불변(0351 과 동일 8인자) → CREATE OR REPLACE(DROP 불필요). 반환 컬럼도 불변.
-- 0351 대비 유일 변경 = WHERE 검색 결합 로직(AND→OR). 나머지(명함검증·정렬 화이트리스트·집계·
--   COLLATE)는 0351 그대로.

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
  last_visit_on        date,
  visit_count          bigint,
  age_years            int
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

  -- 2. 정렬 화이트리스트 검증(인젝션 차단)
  IF p_sort_by NOT IN ('created_at', 'patient_name', 'last_visit_on', 'visit_count', 'status', 'patient_birthdate') THEN
    RAISE EXCEPTION 'invalid_sort_by' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(p_sort_dir, 'desc')) NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'invalid_sort_dir' USING ERRCODE = '22023';
  END IF;

  -- 3. 상태 필터 검증
  IF p_status_filter IS NOT NULL
     AND p_status_filter NOT IN ('pending', 'active', 'rejected', 'revoked') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  -- 4. 검색어 ILIKE 와일드카드 이스케이프
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
    CASE WHEN l.patient_birthdate IS NOT NULL
         THEN date_part('year', age(l.patient_birthdate))::int
         ELSE NULL END AS age_years
  FROM public.clinic_member_links l
  LEFT JOIN public.profiles pr ON pr.id = l.profile_id
  LEFT JOIN LATERAL (
    SELECT max(d.visited_on) AS last_visit_on, count(*)::bigint AS visit_count
    FROM public.diaries d
    WHERE d.profile_id = l.profile_id
      AND d.clinic_id = v_clinic_id
      AND d.source = 'clinic'
  ) agg ON true
  WHERE l.clinic_id = v_clinic_id
    -- 상태 필터(있으면 AND).
    AND (p_status_filter IS NULL OR l.status = p_status_filter)
    -- 검색: 텍스트(이름·등록번호·아이디 ILIKE) OR 생일(동등) — 한 창에서 아무 필드나(§2.3).
    --   검색어·생일 둘 다 없으면 전체.
    AND (
      (v_q IS NULL AND p_birthdate IS NULL)
      OR (v_q IS NOT NULL AND (
            l.patient_name ILIKE '%' || v_q || '%'
            OR l.registration_number ILIKE '%' || v_q || '%'
            OR pr.handle ILIKE '%' || v_q || '%'
          ))
      OR (p_birthdate IS NOT NULL AND l.patient_birthdate = p_birthdate)
    )
  ORDER BY
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
    l.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_patients(uuid, text, date, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_patients(uuid, text, date, text, text, text, int, int) TO authenticated;
