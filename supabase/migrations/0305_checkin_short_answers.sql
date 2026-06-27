-- 0305_checkin_short_answers.sql
-- 시점별 체크인 폼(/reviews/{id}/checkins)에 "단답 2칸" 저장 경로 추가.
--
-- 배경:
--   단독 후기폼(/review/new)은 0304 에서 단답 2칸을 적용 완료했다(create_procedure_review 에
--   p_short_answers 추가 → short_answer_response 에 review_id 만 연결, checkin_id=NULL).
--   같은 패턴을 시점별 체크인 폼으로 확장한다. 차이점:
--     (1) 폼이 로드하는 질문이 "시점별"이다 — 해당 timepoint(week1/month1/month4) + 공통 'any'.
--     (2) 저장 시 review_id 뿐 아니라 그 시점의 review_checkin.id(checkin_id)를 함께 연결한다.
--
-- 변경:
--   upsert_review_checkin 에 p_short_answers jsonb DEFAULT NULL(끝 인자) 추가.
--     체크인 UPSERT 후 RETURNING 으로 확보한 checkin_id 로 short_answer_response 에 INSERT.
--     - jsonb 배열 [{question_id, answer_text}] 형식.
--     - active 한 풀(question_pool.is_active)에 존재하는 question_id, 빈/널 답변 제외만 저장.
--     - 재제출(같은 시점 upsert) 멱등성: UNIQUE(review_id, question_id, checkin_id) 충돌을
--       피하고 "다시 고르기"로 질문이 바뀐 경우의 잔재도 정리하기 위해, 그 checkin_id 의
--       기존 단답을 먼저 DELETE 한 뒤 INSERT(같은 트랜잭션).
--   인자 시그니처가 바뀌므로 기존 7-인자 함수를 먼저 DROP 후 8-인자로 재생성, GRANT 재부여.
--
--   ※ 함수 본문은 production pg_get_functiondef(2026-06-27 확인)를 VERBATIM 보존하고
--     단답 DELETE+INSERT 한 블록만 추가했다(롤업·권한·CHECK 로직 무변경).
--   ※ 한국어 주석 포함 → node fetch UTF-8 POST 경로로만 적용(콘솔 CP949 직접 투입 금지).

BEGIN;

-- 기존 7-인자 함수 DROP(시그니처 변경 — p_short_answers 추가).
DROP FUNCTION IF EXISTS public.upsert_review_checkin(bigint, text, smallint, smallint, smallint, smallint, text[]);

CREATE OR REPLACE FUNCTION public.upsert_review_checkin(
  p_review_id       bigint,
  p_timepoint       text,
  p_satisfaction    smallint DEFAULT NULL,
  p_recommend       smallint DEFAULT NULL,
  p_effect_felt     smallint DEFAULT NULL,
  p_pain            smallint DEFAULT NULL,
  p_changed_points  text[]   DEFAULT NULL,
  p_short_answers   jsonb    DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_author uuid; v_checkin_id bigint;
BEGIN
  SELECT author_id INTO v_author FROM public.procedure_reviews WHERE id = p_review_id;
  IF v_author IS NULL THEN RAISE EXCEPTION 'review_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_author AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_timepoint NOT IN ('day0','week1','month1','month4') THEN
    RAISE EXCEPTION 'invalid_timepoint' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.review_checkin
    (review_id, timepoint, satisfaction, recommend, effect_felt, pain, changed_points, submitted_at)
  VALUES (p_review_id, p_timepoint, p_satisfaction, p_recommend, p_effect_felt, p_pain, p_changed_points, now())
  ON CONFLICT (review_id, timepoint) DO UPDATE
    SET satisfaction = EXCLUDED.satisfaction, recommend = EXCLUDED.recommend,
        effect_felt = EXCLUDED.effect_felt, pain = EXCLUDED.pain,
        changed_points = EXCLUDED.changed_points, submitted_at = now()
  RETURNING id INTO v_checkin_id;

  -- 결론칸 롤업: 만족도·추천=최신 시점, 통증=day0.
  UPDATE public.procedure_reviews pr SET
    satisfaction = COALESCE(
      (SELECT satisfaction FROM public.review_checkin
        WHERE review_id = p_review_id AND satisfaction IS NOT NULL
        ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.satisfaction),
    recommend = COALESCE(
      (SELECT recommend FROM public.review_checkin
        WHERE review_id = p_review_id AND recommend IS NOT NULL
        ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.recommend),
    pain = COALESCE(
      (SELECT pain FROM public.review_checkin WHERE review_id = p_review_id AND timepoint = 'day0'),
      pr.pain),
    updated_at = now()
  WHERE pr.id = p_review_id;

  -- 단답(short_answers) 저장 — jsonb 배열 [{question_id, answer_text}], checkin_id 연결.
  --   재제출(같은 시점 upsert) 시 이 checkin 의 기존 단답을 먼저 정리(다시 고르기로 질문이 바뀐
  --   경우의 잔재 제거 + UNIQUE(review_id, question_id, checkin_id) 충돌 회피)한 뒤 INSERT.
  --   active 한 풀(question_pool.is_active)에 존재하는 question_id, 빈/널 답변 제외만 저장.
  IF p_short_answers IS NOT NULL AND jsonb_typeof(p_short_answers) = 'array' THEN
    DELETE FROM public.short_answer_response
     WHERE review_id = p_review_id AND checkin_id = v_checkin_id;

    INSERT INTO public.short_answer_response (review_id, checkin_id, question_id, answer_text)
    SELECT p_review_id, v_checkin_id, (elem->>'question_id')::bigint, btrim(elem->>'answer_text')
    FROM jsonb_array_elements(p_short_answers) AS elem
    WHERE (elem->>'question_id') IS NOT NULL
      AND btrim(COALESCE(elem->>'answer_text','')) <> ''
      AND EXISTS (
        SELECT 1 FROM public.question_pool q
         WHERE q.id = (elem->>'question_id')::bigint AND q.is_active
      );
  END IF;

  RETURN v_checkin_id;
END;
$function$;

-- 8-인자 함수에 EXECUTE 권한 재부여(authenticated 가 API 호출 주체).
GRANT EXECUTE ON FUNCTION public.upsert_review_checkin(
  bigint, text, smallint, smallint, smallint, smallint, text[], jsonb) TO authenticated;

COMMIT;
