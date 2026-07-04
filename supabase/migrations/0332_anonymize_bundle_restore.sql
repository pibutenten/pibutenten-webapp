-- 0332_anonymize_bundle_restore.sql
-- Phase 1-A / H-2 (2026-07-04): 탈퇴 익명화를 묶음 전체로 복원.
--
-- 배경: anonymize_user_content_before_delete() 가 0162 이후 active 명함 1개만
--   (WHERE id = v_target) 익명화하도록 축소됐다. 그러나 /api/me/delete 는 auth.users
--   전체를 삭제하므로(묶음의 모든 명함이 한 auth 계정 공유), active 가 아닌 나머지
--   명함의 PII(handle·display_name·birthdate·contact_email·fitzpatrick 등)가 그대로
--   남고 auth_user_id 만 NULL(FK ON DELETE SET NULL)로 끊긴 채 영구 고아가 됐다(PIPA
--   위반 소지). 실측: auth_user_id 공유 묶음 9개(최대 3명) 존재.
--
-- 수정: 0109 원설계처럼 묶음 전체(id = auth.uid() OR auth_user_id = auth.uid())를
--   루프로 익명화하되 세 가지 보완:
--   (1) 의사 명함(role='doctor' 또는 doctor_id 연결)은 익명화 대상에서 제외
--       (원장 결정 2026-07-04). 의사 실명은 공개 Q&A 작성자로 유지 — doctors 테이블과
--       별개이며 콘텐츠 보존 정책. 회원 명함만 '(탈퇴한 사용자)'로 익명화.
--       조건은 NOT (role='doctor' OR doctor_id IS NOT NULL) 로 명시(의도=의사 명함 전체 제외).
--   (2) v_mask(익명 handle)를 루프 안에서 각 프로필 id 로 개별 생성. 루프 밖 단일
--       mask 를 쓰면 묶음 2~3명이 동일 handle 로 UPDATE 되어 idx_profiles_handle_unique
--       (partial UNIQUE, handle IS NOT NULL) 위반 → 트랜잭션 롤백 → 탈퇴 불가.
--   (3) fitzpatrick(피부 광반응 유형, 0323 신설·0325 PII 분류) 도 NULL 로 스크럽.
--   deleted_at IS NULL 필터로 재시도 멱등(이미 익명화된 행 재처리 안 함).
--
-- 소유 범위: (id=v_uid OR auth_user_id=v_uid) 로 스코프되어 타 계정 프로필은 손대지
--   못한다(옛 forbidden RAISE 불필요 — 애초에 본인 묶음만 매칭).
--
-- 배포 순서: 0331(current_active_profile_id 강화)와 반드시 함께 적용. 이 함수 단독이면
--   재시도 시 sub 명함 소유검증이 auth_user_id=NULL 로 실패해 교착 가능.

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
      field_visibility = '{}'::jsonb,
      marketing_email_consent = false,
      auth_user_id = NULL,
      deleted_at = now(),
      updated_at = now()
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$;
