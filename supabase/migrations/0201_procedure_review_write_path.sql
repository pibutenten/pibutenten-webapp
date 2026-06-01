-- 0201: 시술 후기 쓰기 경로 — category CHECK 확장 + 원자적 생성 RPC (P3-c)
--
-- category CHECK 에 review/review_summary 추가(동기화 페어: post-category.ts 동반 변경).
-- create_procedure_review: 개별 후기 카드(type=review) + procedure_reviews 행을 한 트랜잭션에 생성.
--   SECURITY DEFINER + auth.uid() 본인검증으로 고아 카드·권한 우회 차단.

ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_category_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_category_check
  CHECK (category = ANY (ARRAY['qa','doodle','review','review_summary']));

CREATE OR REPLACE FUNCTION public.create_procedure_review(
  p_author_id        uuid,
  p_procedure_ko     text,
  p_title            text,
  p_body             text,
  p_keywords         text[],
  p_status           text,
  p_shortcode        text,
  p_post_year        int,
  p_satisfaction     smallint,
  p_effect           smallint,
  p_pain             smallint,
  p_recovery_days    smallint,
  p_would_recommend  boolean,
  p_area             text     DEFAULT NULL,
  p_cost_satisfaction smallint DEFAULT NULL,
  p_effect_areas     text[]   DEFAULT NULL
) RETURNS TABLE(card_id bigint, shortcode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_card_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_author_id AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_author' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procedure_taxonomy WHERE ko = p_procedure_ko AND active) THEN
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
    (card_id, procedure_ko, author_id, satisfaction, effect, pain, recovery_days, would_recommend, area, cost_satisfaction, effect_areas)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_effect, p_pain, p_recovery_days, p_would_recommend, p_area, p_cost_satisfaction, p_effect_areas);

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,smallint,boolean,text,smallint,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,smallint,boolean,text,smallint,text[]) TO authenticated;
