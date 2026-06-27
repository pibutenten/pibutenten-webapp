-- 0308_review_visited_on.sql
-- 단독(standalone) 시술후기에 "어림시기(받은 날짜)" 저장 지원.
--
-- 배경:
--   /review/new · /write?tab=review 의 후기 폼(ReviewForm)에 어림시기(언제 받으셨어요?)를 추가한다.
--   procedure_reviews 에는 date_precision(exact/season/half/year/unknown)은 있으나 실제 날짜 컬럼이 없어
--   단독 후기의 어림시기 날짜를 저장할 수 없었다(create_procedure_review 가 date_precision='exact' 하드코딩).
--   (통합 visit 경로는 visits 테이블에 visited_on 을 저장하지만, 단독 후기는 visit 행이 없으므로 후기 행에 보관.)
--
-- 변경:
--   (1) procedure_reviews.visited_on date NULL 추가(단독 후기 어림시기 대표일. unknown/미전송이면 NULL).
--   (2) create_procedure_review 시그니처 확장:
--         p_visited_on date DEFAULT NULL      — 어림시기 대표일(YYYY-MM-DD). NULL 허용.
--         p_date_precision text DEFAULT 'exact' — 기존 하드코딩 'exact' 대체(exact/season/half/year/unknown).
--       procedure_reviews INSERT 에 visited_on = p_visited_on, date_precision = COALESCE(p_date_precision,'exact')
--       반영. is_public=true · source='standalone' · recommend · short_answers · review_summary lazy 생성 등
--       기존 동작은 전부 VERBATIM 보존.
--
-- 주의(0303 와 동일): 새 파라미터를 끝에 추가하면 인자 시그니처가 바뀌어 CREATE OR REPLACE 가 기존
--   16-인자 함수를 "치환"하지 못하고 별도 오버로드를 만든다. 호출 모호성 방지를 위해 기존 16-인자
--   시그니처를 먼저 DROP 한 뒤 18-인자로 재생성하고, DROP 으로 사라진 EXECUTE 권한을 새 시그니처에 재부여.
--
-- 적용: 한국어 주석 포함 → node fetch UTF-8 POST 경로로만 적용(콘솔 CP949 직접 투입 금지, CLAUDE.md §8).

-- ============================================================
-- (1) 어림시기 날짜 컬럼.
-- ============================================================
ALTER TABLE public.procedure_reviews ADD COLUMN IF NOT EXISTS visited_on date;

-- ============================================================
-- (2) create_procedure_review — visited_on / date_precision 인자 추가.
-- ============================================================
DROP FUNCTION IF EXISTS public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb);

CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_short_answers jsonb DEFAULT NULL::jsonb, p_visited_on date DEFAULT NULL::date, p_date_precision text DEFAULT 'exact'::text)
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_review_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_author_id AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_author' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tag_dictionary WHERE ko = p_procedure_ko AND is_procedure) THEN
    RAISE EXCEPTION 'unknown_procedure' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
  VALUES ('review'::qa_type, 'review', p_author_id, p_title, COALESCE(p_body,''),
          COALESCE(p_keywords, ARRAY[p_procedure_ko]), p_status::qa_status, p_shortcode, p_post_year)
  RETURNING id INTO v_card_id;

  INSERT INTO public.procedure_reviews
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, is_public, source, visited_on, date_precision)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, p_recommend, true, 'standalone', p_visited_on, COALESCE(p_date_precision, 'exact'))
  RETURNING id INTO v_review_id;

  -- 단답(short_answers) 저장 — jsonb 배열 [{question_id, answer_text}].
  --   active 한 풀(question_pool.is_active)에 존재하는 question_id, 빈/널 답변 제외만 저장.
  IF p_short_answers IS NOT NULL AND jsonb_typeof(p_short_answers) = 'array' THEN
    INSERT INTO public.short_answer_response (review_id, checkin_id, question_id, answer_text)
    SELECT v_review_id, NULL, (elem->>'question_id')::bigint, btrim(elem->>'answer_text')
    FROM jsonb_array_elements(p_short_answers) AS elem
    WHERE (elem->>'question_id') IS NOT NULL
      AND btrim(COALESCE(elem->>'answer_text','')) <> ''
      AND EXISTS (
        SELECT 1 FROM public.question_pool q
         WHERE q.id = (elem->>'question_id')::bigint AND q.is_active
      );
  END IF;

  -- published 면 자기 + 부모 리포트 앵커(review_summary) lazy 생성(이미 있으면 무동작). 리포트는 published.
  IF p_status = 'published' THEN
    INSERT INTO public.cards
      (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
    SELECT
      'review_summary'::qa_type, 'review_summary',
      (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
      '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
    FROM public.tag_dictionary t
    WHERE t.ko IN (
            p_procedure_ko,
            (SELECT parent_ko FROM public.tag_dictionary WHERE ko = p_procedure_ko)
          )
      AND t.is_procedure
      AND t.en IS NOT NULL
    ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $function$;

-- 기존 16-인자 함수에 있던 EXECUTE 권한(authenticated)을 새 18-인자 함수에 재부여.
--   DROP 으로 사라졌으므로 명시 재부여(authenticated 가 API 호출 주체).
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb, date, text) TO authenticated;
