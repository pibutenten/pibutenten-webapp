-- 0354: create_procedure_review 에 visit_id / diary_procedure_id 추가 (노트↔후기 연결)
--  배경: 회원 시술기록(노트)에서 '시술후기 쓰기'로 작성한 후기를 그 방문(visit)에 연결해
--    '이 시술에 후기를 이미 썼는지' FK 로 정확 판정(텍스트매칭 금지). procedure_reviews.visit_id/
--    diary_procedure_id FK 와 source_link_chk 는 이미 존재(0292) — 이 함수만 source='standalone'
--    하드코딩이라 연결을 못 넣던 갭을 메운다.
--  방식: 기존 19인자 시그니처를 DROP(오버로드 'not unique' 회피) 후, p_visit_id/p_diary_procedure_id 를
--    '끝에' 추가해 재생성(기존 positional/named 호출 안전). visit_id 전달 시:
--    ① 그 diary 가 작성자 소유(diaries.profile_id = p_author_id)인지 검증(횡단 차단),
--    ② diary_procedure_id 는 그 visit 소속인지 검증,
--    ③ source='diary_linked'(source_link_chk 통과 — diary_linked↔visit_id NOT NULL).
--    visit_id 없으면 종전과 100% 동일(source='standalone', 과거 standalone 후기 무회귀).
--  현재 production 정의(pg_get_functiondef)를 그대로 두고 위 3점만 수술적으로 추가.

DROP FUNCTION IF EXISTS public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb, date, text, text[]);

CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_short_answers jsonb DEFAULT NULL::jsonb, p_visited_on date DEFAULT NULL::date, p_date_precision text DEFAULT 'exact'::text, p_reactions text[] DEFAULT '{}'::text[], p_visit_id bigint DEFAULT NULL::bigint, p_diary_procedure_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_review_id bigint;
  v_source text := 'standalone';
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

  -- 방문 연결(0354): 소유·정합 검증 후 source 를 diary_linked 로. 판정은 FK 만(텍스트매칭 금지).
  IF p_visit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.diaries d
      WHERE d.id = p_visit_id AND d.profile_id = p_author_id
    ) THEN
      RAISE EXCEPTION 'not_authorized_visit' USING ERRCODE = '42501';
    END IF;
    IF p_diary_procedure_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.diary_procedures dp
      WHERE dp.id = p_diary_procedure_id AND dp.diary_id = p_visit_id
    ) THEN
      RAISE EXCEPTION 'invalid_diary_procedure' USING ERRCODE = '22023';
    END IF;
    v_source := 'diary_linked';
  END IF;

  INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
  VALUES ('review'::qa_type, 'review', p_author_id, p_title, COALESCE(p_body,''),
          COALESCE(p_keywords, ARRAY[p_procedure_ko]), p_status::qa_status, p_shortcode, p_post_year)
  RETURNING id INTO v_card_id;

  INSERT INTO public.procedure_reviews
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, is_public, source, visited_on, date_precision, reactions, visit_id, diary_procedure_id)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, p_recommend, true, v_source, p_visited_on, COALESCE(p_date_precision, 'exact'), COALESCE(p_reactions, '{}'),
     p_visit_id,
     CASE WHEN p_visit_id IS NOT NULL THEN p_diary_procedure_id ELSE NULL END)
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

-- 권한 복원(DROP 시 소멸) — 재생성 전과 동일하게 authenticated 에 EXECUTE. 함수가 auth.uid() 자체 검증.
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb, date, text, text[], bigint, bigint) TO authenticated;
