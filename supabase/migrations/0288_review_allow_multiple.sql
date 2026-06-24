-- 0288_review_allow_multiple.sql
-- 같은 명함이 같은 시술에 후기 여러 개 작성 허용.
--
-- 1) UNIQUE(author_id, procedure_ko) 제약 제거.
--    card_id UNIQUE(procedure_reviews_card_id_key, 카드↔후기 1:1)는 유지.
-- 2) create_procedure_review 에서 'duplicate_review' 사전검사 블록만 제거.
--    시그니처·로직·본인검증·시술검증·리포트 lazy 생성은 직전 운영본(0258 기반)과 100% 동일.

ALTER TABLE public.procedure_reviews
  DROP CONSTRAINT IF EXISTS procedure_reviews_author_procedure_uniq;

CREATE OR REPLACE FUNCTION public.create_procedure_review(
  p_author_id uuid,
  p_procedure_ko text,
  p_title text,
  p_body text,
  p_keywords text[],
  p_status text,
  p_shortcode text,
  p_post_year integer,
  p_satisfaction smallint,
  p_pain smallint,
  p_revisit text,
  p_effect_areas text[] DEFAULT NULL::text[],
  p_downtime text DEFAULT NULL::text,
  p_effect_onset text DEFAULT NULL::text
)
RETURNS TABLE(card_id bigint, shortcode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_card_id bigint;
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
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset);

  -- published 면 자기 + 부모 시술 리포트(review_summary) lazy 생성(이미 있으면 무동작). 리포트는 published.
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
