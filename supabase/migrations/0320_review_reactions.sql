-- 0320_review_reactions.sql
-- 시술 직후 반응(멀티선택, 한글 라벨 저장)을 procedure_reviews 에 저장.
-- procedure_reviews.reactions text[] 컬럼 추가 +
-- create_procedure_review / update_procedure_review 두 RPC 에 p_reactions 파라미터 추가.
--
-- ⚠️ 오버로드 방지: 파라미터를 늘리면 시그니처가 달라져 CREATE OR REPLACE 만으로는
--   기존 함수와 별개의 새 오버로드가 생겨 PostgREST 호출이 "function is not unique" 로 깨진다.
--   따라서 기존 정확한 시그니처를 DROP 한 뒤 새로 CREATE 하고, 명시 GRANT(authenticated)를 재부여한다.

-- ── 1) 컬럼 추가 ───────────────────────────────────────────────
ALTER TABLE public.procedure_reviews
  ADD COLUMN IF NOT EXISTS reactions text[] DEFAULT '{}'::text[];

-- ── 2) create_procedure_review : 기존 시그니처 DROP 후 재생성 ──
DROP FUNCTION IF EXISTS public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb, date, text);

CREATE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_short_answers jsonb DEFAULT NULL::jsonb, p_visited_on date DEFAULT NULL::date, p_date_precision text DEFAULT 'exact'::text, p_reactions text[] DEFAULT '{}'::text[])
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
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, is_public, source, visited_on, date_precision, reactions)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset, p_recommend, true, 'standalone', p_visited_on, COALESCE(p_date_precision, 'exact'), COALESCE(p_reactions, '{}'))
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

GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid, text, text, text, text[], text, text, integer, smallint, smallint, text, text[], text, text, smallint, jsonb, date, text, text[]) TO authenticated;

-- ── 3) update_procedure_review : 기존 시그니처 DROP 후 재생성 ──
DROP FUNCTION IF EXISTS public.update_procedure_review(text, text, text, text[], text, smallint, smallint, text, text[], text, text, smallint);

CREATE FUNCTION public.update_procedure_review(p_shortcode text, p_title text, p_body text, p_keywords text[], p_status text, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text, p_recommend smallint DEFAULT NULL::smallint, p_reactions text[] DEFAULT NULL::text[])
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_author uuid;
  v_is_admin boolean;
  v_procedure_ko text;
BEGIN
  SELECT c.id, c.author_id INTO v_card_id, v_author
  FROM public.cards c
  WHERE c.shortcode = p_shortcode
    AND c.type = 'review'::qa_type
    AND c.deleted_at IS NULL;
  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_author AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cards
  SET title = p_title,
      body = COALESCE(p_body, ''),
      keywords = COALESCE(p_keywords, public.cards.keywords),
      status = p_status::qa_status,
      updated_at = now()
  WHERE public.cards.id = v_card_id;

  UPDATE public.procedure_reviews pr
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      downtime = CASE WHEN COALESCE(array_length(p_reactions,1),0)=0 THEN pr.downtime ELSE p_downtime END,
      effect_onset = p_effect_onset,
      recommend = COALESCE(p_recommend, pr.recommend),
      reactions = COALESCE(p_reactions, pr.reactions),
      updated_at = now()
  WHERE pr.card_id = v_card_id;

  -- published 면 자기 + 부모 리포트 lazy 생성(이미 있으면 무동작). 리포트는 published.
  IF p_status = 'published' THEN
    SELECT prr.procedure_ko INTO v_procedure_ko
    FROM public.procedure_reviews prr
    WHERE prr.card_id = v_card_id;

    IF v_procedure_ko IS NOT NULL THEN
      INSERT INTO public.cards
        (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
      SELECT
        'review_summary'::qa_type, 'review_summary',
        (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
        '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
      FROM public.tag_dictionary t
      WHERE t.ko IN (
              v_procedure_ko,
              (SELECT parent_ko FROM public.tag_dictionary WHERE ko = v_procedure_ko)
            )
        AND t.is_procedure
        AND t.en IS NOT NULL
      ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;

GRANT EXECUTE ON FUNCTION public.update_procedure_review(text, text, text, text[], text, smallint, smallint, text, text[], text, text, smallint, text[]) TO authenticated;
