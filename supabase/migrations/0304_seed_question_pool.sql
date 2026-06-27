-- 0304_seed_question_pool.sql
-- 단답 질문 풀 시드 + 'any' 시점 허용 + 단독 후기 경로 단답 저장.
--
-- 배경:
--   question_pool / short_answer_response 테이블은 0293 에서 골격만 생성(빈 상태)되었다.
--   단독 후기폼(/review/new)에 "단답 2칸"(랜덤 1문항씩 + 답 입력)을 노출하려면
--   (1) 질문 풀 데이터 시드, (2) 폼이 로드할 'any'(시점 무관) 분류 허용,
--   (3) 후기 생성 RPC 가 같은 트랜잭션에서 short_answer_response 를 저장하도록 확장이 필요하다.
--
-- 변경:
--   1) question_pool_timepoint_check 를 DROP→재생성하여 'any' 시점을 허용.
--      (기존 day0/week1/month1/month4 는 그대로 유지 — 회귀 0.)
--   2) 확정 질문을 timepoint 태깅해 멱등 INSERT(is_active=true, weight=1, category='').
--      question_text 에 유니크 제약이 없으므로 (timepoint, question_text) NOT EXISTS 가드로 멱등.
--      ※ DDL(0293)상 category 는 NOT NULL 이라 NULL 대신 '' 로 저장(의미: 미분류).
--   3) create_procedure_review 에 p_short_answers jsonb DEFAULT NULL 추가(끝 인자) →
--      후기 카드·procedure_reviews 생성과 같은 트랜잭션에서 short_answer_response 에 INSERT.
--      jsonb 배열 [{question_id, answer_text}] 형식. question_id 가 active 한 풀에 존재할 때만 저장.
--      (인자 시그니처가 바뀌므로 기존 15-인자 함수를 먼저 DROP 후 16-인자로 재생성, GRANT 재부여.)

BEGIN;

-- ============================================================
-- (1) timepoint CHECK 확장 — 'any'(시점 무관) 분류 허용.
-- ============================================================
ALTER TABLE public.question_pool DROP CONSTRAINT IF EXISTS question_pool_timepoint_check;
ALTER TABLE public.question_pool
  ADD CONSTRAINT question_pool_timepoint_check
  CHECK (timepoint IN ('day0','week1','month1','month4','any'));

-- ============================================================
-- (2) 질문 풀 시드 — 멱등(동일 timepoint+question_text 가 이미 있으면 건너뜀).
--     VALUES 의 (timepoint, question_text) 를 풀어 NOT EXISTS 가드로 INSERT.
-- ============================================================
INSERT INTO public.question_pool (timepoint, category, question_text, is_active, weight)
SELECT v.timepoint, '', v.question_text, true, 1
FROM (VALUES
  -- day0 (시술 직후)
  ('day0',  '통증은 어느 정도였어요?'),
  ('day0',  '시술 직후, 거울 봤을 때 첫 느낌은 어땠어요?'),
  ('day0',  '받기 전의 나에게 해주고 싶은 말이 있다면?'),
  ('day0',  '예상과 가장 달랐던 점이 있었나요?'),
  ('day0',  '마취는 견딜 만했어요?'),
  -- week1 (1주차)
  ('week1', '멍이나 부기는 며칠 만에 가라앉았어요?'),
  ('week1', '일상으로 돌아오기까지 며칠 걸렸어요?'),
  ('week1', '이 기간에 가장 신경 쓰였던 건 뭐였어요?'),
  ('week1', '세안·화장은 언제부터 다시 했어요?'),
  -- month1 (1개월)
  ('month1', '피부에 어떤 변화를 가장 크게 느끼셨어요?'),
  ('month1', '주변에서 "달라졌다"는 말 들어보셨어요?'),
  ('month1', '처음 기대했던 것과 비교하면 어떤가요?'),
  ('month1', '비용을 생각하면 만족스러우세요?'),
  ('month1', '받길 잘했다 싶었던 순간이 있었나요?'),
  -- month4 (4개월)
  ('month4', '효과는 지금도 잘 유지되고 있어요?'),
  ('month4', '다시 받을 생각이 있으세요?'),
  ('month4', '같은 고민을 가진 분께 추천하시겠어요?'),
  ('month4', '받길 잘했다 싶었던 순간이 있었나요?'),
  -- any (시점 무관 — 단독 후기폼 단답 2칸이 사용)
  ('any', '받길 잘했다고 느낀 순간이 있었나요?'),
  ('any', '받기 전의 나에게 해주고 싶은 말이 있다면?'),
  ('any', '기대와 가장 달랐던 점은 무엇이었어요?'),
  ('any', '그 밖에 하고 싶은 말을 자유롭게 적어주세요.')
) AS v(timepoint, question_text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.question_pool q
   WHERE q.timepoint = v.timepoint
     AND q.question_text = v.question_text
);

-- ============================================================
-- (3) create_procedure_review — 단답(short_answers) 저장 인자 추가.
--     기존 15-인자 함수 본문을 VERBATIM 보존하고 단답 INSERT 한 블록만 추가.
-- ============================================================
DROP FUNCTION IF EXISTS public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint);

CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_short_answers jsonb DEFAULT NULL::jsonb)
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
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, is_public, source, date_precision)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, p_recommend, true, 'standalone', 'exact')
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

-- 16-인자 함수에 EXECUTE 권한 재부여(authenticated 가 API 호출 주체).
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb) TO authenticated;

COMMIT;
