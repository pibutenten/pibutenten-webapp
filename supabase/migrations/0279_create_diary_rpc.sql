-- 0279_create_diary_rpc.sql
-- create_diary RPC — diaries 1행 + diary_procedures N행을 원자적(한 트랜잭션)으로 INSERT.
--   소유검증: p_profile_id 가 auth.uid() 소유 명함인지 profiles 에서 직접 확인(create_procedure_review 동일 패턴).
--   SECURITY DEFINER + search_path 고정. 입력값 이중검증(zod + RPC). authenticated 전용.
--   반환: 생성된 diary id(bigint).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_diary(
  p_profile_id    uuid,
  p_visited_on    date,
  p_clinic_id     bigint  DEFAULT NULL,
  p_clinic_name   text    DEFAULT NULL,
  p_clinic_addr   text    DEFAULT NULL,
  p_clinic_tel    text    DEFAULT NULL,
  p_clinic_x      double precision DEFAULT NULL,
  p_clinic_y      double precision DEFAULT NULL,
  p_doctor_name   text    DEFAULT NULL,
  p_manager_name  text    DEFAULT NULL,
  p_diary_body    text    DEFAULT NULL,
  p_procedures    jsonb   DEFAULT '[]'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_diary_id  bigint;
  v_proc      jsonb;
  v_idx       int := 0;
  v_ko        text;
  v_len       int;
BEGIN
  -- 1. 소유검증 — p_profile_id 가 호출자(auth.uid()) 소유 명함인지(위조 차단).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  -- 2. visited_on 범위(미래/너무 먼 과거 차단).
  IF p_visited_on > CURRENT_DATE THEN RAISE EXCEPTION 'visited_on_future' USING ERRCODE = '22023'; END IF;
  IF p_visited_on < DATE '2000-01-01' THEN RAISE EXCEPTION 'visited_on_too_old' USING ERRCODE = '22023'; END IF;

  -- 3. diary_body 길이(DB CHECK 와 이중 방어).
  IF char_length(p_diary_body) > 400 THEN RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001'; END IF;

  -- 4. 시술 배열 검증(1~20, 각 항목).
  IF jsonb_typeof(p_procedures) <> 'array' THEN RAISE EXCEPTION 'procedures_not_array' USING ERRCODE = '22023'; END IF;
  v_len := jsonb_array_length(p_procedures);
  IF v_len < 1  THEN RAISE EXCEPTION 'procedures_empty' USING ERRCODE = '22023'; END IF;
  IF v_len > 20 THEN RAISE EXCEPTION 'procedures_too_many' USING ERRCODE = '22023'; END IF;

  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    v_ko := v_proc->>'procedure_ko';
    IF v_ko IS NULL OR char_length(v_ko) = 0 OR char_length(v_ko) > 100 THEN
      RAISE EXCEPTION 'invalid_procedure_ko' USING ERRCODE = '22023';
    END IF;
    IF (v_proc->'price') IS NOT NULL AND jsonb_typeof(v_proc->'price') <> 'null'
       AND ((v_proc->>'price') !~ '^\d+$' OR (v_proc->>'price')::bigint < 0 OR (v_proc->>'price')::bigint > 2000000000) THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_proc->>'note') > 500 THEN RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22001'; END IF;
    IF char_length(v_proc->>'unit_text') > 100 THEN RAISE EXCEPTION 'unit_text_too_long' USING ERRCODE = '22001'; END IF;
  END LOOP;

  -- 5. 부모 INSERT.
  INSERT INTO public.diaries (
    profile_id, visited_on, clinic_id, clinic_name, clinic_addr, clinic_tel,
    clinic_x, clinic_y, doctor_name, manager_name, diary_body
  ) VALUES (
    p_profile_id, p_visited_on, p_clinic_id, NULLIF(p_clinic_name, ''), NULLIF(p_clinic_addr, ''), NULLIF(p_clinic_tel, ''),
    p_clinic_x, p_clinic_y, NULLIF(p_doctor_name, ''), NULLIF(p_manager_name, ''), NULLIF(p_diary_body, '')
  ) RETURNING id INTO v_diary_id;

  -- 6. 자식 INSERT(배열 순서).
  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    INSERT INTO public.diary_procedures (
      diary_id, procedure_ko, tag_dict_ko, unit_text, price, note, sort_order
    ) VALUES (
      v_diary_id,
      v_proc->>'procedure_ko',
      NULLIF(v_proc->>'tag_dict_ko', ''),
      NULLIF(v_proc->>'unit_text', ''),
      CASE WHEN (v_proc->>'price') ~ '^\d+$' THEN (v_proc->>'price')::integer ELSE NULL END,
      NULLIF(v_proc->>'note', ''),
      COALESCE((v_proc->>'sort_order')::smallint, v_idx::smallint)
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_diary_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_diary(uuid, date, bigint, text, text, text, double precision, double precision, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_diary(uuid, date, bigint, text, text, text, double precision, double precision, text, text, text, jsonb) TO authenticated;

COMMIT;
