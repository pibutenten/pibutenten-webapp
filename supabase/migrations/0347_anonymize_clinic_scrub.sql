-- 0347_anonymize_clinic_scrub.sql
-- 병원 계정 · 시술노트 대행 — 탈퇴 익명화에 legal_name + 병원 스냅샷 PII 파기 추가 (2026-07-05)
--
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §E-H5
--
-- 배경: 0342 로 profiles.legal_name(선택 복원용 실명)과 0344 로 clinic_member_links
--   (회원→병원 제공 PII 스냅샷)가 신설되어, 회원 탈퇴 시 개인정보 파기 대상이 늘었다.
--   기존 anonymize_user_content_before_delete() 는 이 두 신설 위치를 스크럽하지 않아
--   탈퇴 후에도 실명·병원 보관 스냅샷 PII 가 남는다(PIPA 위반 소지).
--
-- 수정: 0332 의 본문을 100% 그대로 유지(시그니처·소유 스코프·의사 명함 제외·묶음 루프·
--   멱등 필터 불변)하고 딱 2가지만 추가한다.
--   (1) profiles UPDATE SET 절에 legal_name = NULL 추가(기존 birthdate/gender 등과 같은 자리).
--   (2) 회원 명함(r.id)만 순회하는 루프 안에서 그 명함에 걸린 clinic_member_links 행의
--       회원 유래 PII 스냅샷을 NULL 처리(WHERE profile_id = r.id).
--       registration_number 는 병원 내부 챠트번호(그 병원 내부 식별자)라 파기 대상에서 제외 — 남긴다.
--
-- 대상 지정 방식: 이 함수는 파라미터가 없고 auth.uid()(v_uid)로 본인 묶음을 스코프한 뒤,
--   루프 변수 r.id = 각 회원 명함의 profile_id 다. clinic_member_links.profile_id 가
--   회원 명함 FK 이므로 WHERE profile_id = r.id 가 정확한 대상.

CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
 RETURNS TABLE(profiles_anonymized integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r record;
  v_mask text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  FOR r IN
    SELECT id
    FROM public.profiles
    WHERE (id = v_uid OR auth_user_id = v_uid)
      AND NOT (role = 'doctor' OR doctor_id IS NOT NULL)  -- 의사 명함 제외 (원장 결정 2026-07-04)
      AND deleted_at IS NULL                               -- 재시도 멱등
  LOOP
    v_mask := 'deleted-' || substring(replace(r.id::text, '-', ''), 1, 12);
    UPDATE public.profiles
    SET
      handle = v_mask,
      display_name = '(탈퇴한 사용자)',
      avatar_url = NULL,
      bio = NULL,
      contact_email = NULL,
      birthdate = NULL,
      gender = NULL,
      face_shape = NULL,
      skin_type = NULL,
      skin_concerns = '{}'::text[],
      interested_procedures = '{}'::text[],
      fitzpatrick = NULL,
      legal_name = NULL,
      field_visibility = '{}'::jsonb,
      marketing_email_consent = false,
      auth_user_id = NULL,
      deleted_at = now(),
      updated_at = now()
    WHERE id = r.id;

    -- 병원 보관 회원 스냅샷 PII 파기 (0347). registration_number(병원 내부 챠트번호)는 남긴다.
    UPDATE public.clinic_member_links
    SET
      patient_name = NULL,
      patient_email = NULL,
      patient_birthdate = NULL,
      patient_skin_profile = NULL,
      patient_phone = NULL,
      patient_address = NULL,
      requested_legal_name = NULL,
      requested_birthdate = NULL
    WHERE profile_id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$;
