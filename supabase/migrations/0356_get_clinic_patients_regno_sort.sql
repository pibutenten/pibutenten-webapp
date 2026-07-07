-- 0356: get_clinic_patients 정렬에 registration_number(등록번호) 추가
-- 배경: 병원 환자표에서 등록번호로 원내 환자를 찾는 동선이 잦아, 등록번호 클릭 정렬을 허용한다.
--   0352 정의를 그대로 유지하고 (1) 정렬 화이트리스트에 'registration_number' 추가,
--   (2) ORDER BY CASE 분기 2개(asc/desc, NULLS LAST — 등록번호 NULL 다수라 뒤로) 만 더한다.
--   시그니처·반환·나머지 로직 불변(CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_clinic_patients(p_clinic_profile_id uuid, p_search text DEFAULT NULL::text, p_birthdate date DEFAULT NULL::date, p_status_filter text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(link_id bigint, status text, member_handle text, patient_name text, patient_birthdate date, patient_email text, patient_phone text, patient_address text, registration_number text, patient_skin_profile jsonb, consent_at timestamp with time zone, created_at timestamp with time zone, revoked_at timestamp with time zone, last_visit_on date, visit_count bigint, age_years integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 2. 정렬 화이트리스트 검증(인젝션 차단) — registration_number 추가(0356)
  IF p_sort_by NOT IN ('created_at', 'patient_name', 'last_visit_on', 'visit_count', 'status', 'patient_birthdate', 'registration_number') THEN
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
    -- 등록번호 정렬(0356) — 텍스트, NULL(미입력) 은 항상 뒤로.
    CASE WHEN p_sort_by = 'registration_number' AND lower(p_sort_dir) = 'asc'
         THEN l.registration_number END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'registration_number' AND lower(p_sort_dir) = 'desc'
         THEN l.registration_number END DESC NULLS LAST,
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
$function$;
