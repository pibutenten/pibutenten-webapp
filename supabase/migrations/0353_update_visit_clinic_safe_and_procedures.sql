-- 0353_update_visit_clinic_safe_and_procedures.sql
-- 회원 시술노트 편집(C4) 선행 DB 정정 — update_visit(0297) 재정의.
-- 계획 SSOT: docs/plans/260706 …관리 설계.md §4.2 치명2.
--
-- 정정 2가지:
--   [A] 병원 대행 노트(source='clinic') 감사·귀속 컬럼 보존 — 0297 update_visit 이
--       `clinic_id = p_clinic_id` 로 덮어써, 회원이 병원 대행 노트를 편집하면 병원 귀속(clinic_id)이
--       훼손돼 병원 화면에서 그 노트가 사라지는 사고(§4.2 치명2). → source='clinic' 이면 clinic_id 및
--       병원 위치 스냅샷(clinic_name/addr/tel/x/y/home/kakao)을 기존값으로 보존(CASE). source·
--       created_by_clinic_profile_id·linked_consent_at 은 SET 절에 없어 이미 불변.
--   [B] 시술 목록(diary_procedures) 편집 지원 — 0297 은 자식 미동기(D-J)라 회원이 본문만 수정 가능했다.
--       C4("회원이 본인 시술노트 전부 수정")를 위해 p_procedures(선택) 추가: 지정 시 전체 교체
--       (DELETE+INSERT, clinic_update_visit 0350 과 동일 로직). 단 후기 달린 노트는 차단
--       (visit_has_linked_reviews — diary_procedure_id SET NULL 로 후기 시술연결 소실 방지, C5 대칭).
--       미지정(NULL)이면 기존 동작(본문만 수정, 시술 불변) — 하위호환.
--
-- ⚠ 파라미터 추가(p_procedures)로 시그니처 변경 → CREATE OR REPLACE 불가. 기존 16인자 DROP 후 재생성.
--   실측: 현재 update_visit 호출부는 /api/visits/[id] PATCH 라우트뿐(회원 편집 UI 부재) — C4 에서 그
--   라우트를 p_procedures 전달하도록 함께 갱신. DROP 은 구 16인자 시그니처 명시.

DROP FUNCTION IF EXISTS public.update_visit(
  bigint, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean
);

CREATE OR REPLACE FUNCTION public.update_visit(
  p_visit_id             bigint,
  p_visited_on           date,
  p_visited_on_precision text,
  p_clinic_id            bigint,
  p_clinic_name          text,
  p_clinic_addr          text,
  p_clinic_tel           text,
  p_clinic_x             double precision,
  p_clinic_y             double precision,
  p_clinic_home          text,
  p_clinic_kakao         text,
  p_doctor_name          text,
  p_manager_name         text,
  p_diary_body           text,
  p_total_price          int,
  p_is_complete          boolean,
  p_procedures           jsonb DEFAULT NULL   -- 신규(선택): 지정 시 시술 목록 전체 교체. NULL=시술 불변.
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_diary      record;
  v_proc       jsonb;
  v_idx        int := 0;
  v_proc_count int;
BEGIN
  -- 1. 명함 소유검증 + source/clinic 스냅샷 확보(병원 노트 보존용).
  SELECT profile_id, source, clinic_id, clinic_name, clinic_addr, clinic_tel,
         clinic_x, clinic_y, clinic_home, clinic_kakao
    INTO v_diary
  FROM public.diaries WHERE id = p_visit_id;
  IF v_diary.profile_id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_diary.profile_id AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. 입력 검증(0297 계승).
  IF p_visited_on > CURRENT_DATE THEN RAISE EXCEPTION 'visited_on_future' USING ERRCODE = '22023'; END IF;
  IF p_visited_on < DATE '2000-01-01' THEN RAISE EXCEPTION 'visited_on_too_old' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_visited_on_precision, 'exact') NOT IN ('exact','season','half','year') THEN
    RAISE EXCEPTION 'invalid_visited_on_precision' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_diary_body) > 400 THEN RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001'; END IF;

  -- 3. 시술 목록 교체 요청(선택) — 후기 달린 노트는 차단(C5 대칭).
  IF p_procedures IS NOT NULL THEN
    IF jsonb_typeof(p_procedures) <> 'array' THEN
      RAISE EXCEPTION 'procedures_not_array' USING ERRCODE = '22023';
    END IF;
    v_proc_count := jsonb_array_length(p_procedures);
    IF v_proc_count < 1 OR v_proc_count > 20 THEN
      RAISE EXCEPTION 'invalid_procedures_count' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.procedure_reviews r WHERE r.visit_id = p_visit_id) THEN
      RAISE EXCEPTION 'visit_has_linked_reviews' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 4. 본문 UPDATE. ★source='clinic' 이면 clinic_id·병원 위치 스냅샷 보존(§4.2 치명2 — 병원 귀속 훼손 차단).
  UPDATE public.diaries SET
    visited_on           = p_visited_on,
    visited_on_precision = COALESCE(p_visited_on_precision, 'exact'),
    clinic_id            = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_id   ELSE p_clinic_id END,
    clinic_name          = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_name ELSE NULLIF(p_clinic_name, '') END,
    clinic_addr          = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_addr ELSE NULLIF(p_clinic_addr, '') END,
    clinic_tel           = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_tel  ELSE NULLIF(p_clinic_tel, '') END,
    clinic_x             = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_x     ELSE p_clinic_x END,
    clinic_y             = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_y     ELSE p_clinic_y END,
    clinic_home          = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_home  ELSE NULLIF(p_clinic_home, '') END,
    clinic_kakao         = CASE WHEN v_diary.source = 'clinic' THEN v_diary.clinic_kakao ELSE NULLIF(p_clinic_kakao, '') END,
    doctor_name          = NULLIF(p_doctor_name, ''),
    manager_name         = NULLIF(p_manager_name, ''),
    diary_body           = NULLIF(p_diary_body, ''),
    total_price          = p_total_price,
    is_complete          = COALESCE(p_is_complete, true),
    updated_at           = now()
  WHERE id = p_visit_id;

  -- 5. 시술 목록 전체 교체(선택). tag_dict FK 안전화·길이/상한 검증(clinic_update_visit 계승).
  IF p_procedures IS NOT NULL THEN
    DELETE FROM public.diary_procedures WHERE diary_id = p_visit_id;
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
        p_visit_id,
        v_proc->>'procedure_ko',
        (SELECT t.ko FROM public.tag_dictionary t WHERE t.ko = NULLIF(v_proc->>'tag_dict_ko', '')),
        NULLIF(v_proc->>'unit_text', ''),
        CASE WHEN (v_proc->>'price') ~ '^\d{1,10}$' AND (v_proc->>'price')::bigint <= 2000000000
             THEN (v_proc->>'price')::integer ELSE NULL END,
        NULLIF(v_proc->>'note', ''),
        COALESCE((v_proc->>'sort_order')::smallint, v_idx::smallint)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  RETURN p_visit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_visit(
  bigint, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_visit(
  bigint, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean, jsonb
) TO authenticated;
