-- 0205: 후기 항목 대폭 단순화 (원장님 피드백)
--
-- 제거: downtime/sessions/timing(필수3) + concurrent_procedures/adverse_reactions(선택2).
-- 남는 정량: satisfaction·pain·revisit(재시술 의향) + effect_areas(체감 효과). 한줄후기=cards.body(필수).
-- 빈 테이블이라 컬럼 DROP 안전. RPC 시그니처 축소.

ALTER TABLE public.procedure_reviews
  DROP COLUMN IF EXISTS downtime,
  DROP COLUMN IF EXISTS sessions,
  DROP COLUMN IF EXISTS timing,
  DROP COLUMN IF EXISTS concurrent_procedures,
  DROP COLUMN IF EXISTS adverse_reactions;

DROP FUNCTION IF EXISTS public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text,text,text,smallint,text[],text[],text[],text);

CREATE OR REPLACE FUNCTION public.create_procedure_review(
  p_author_id     uuid,
  p_procedure_ko  text,
  p_title         text,
  p_body          text,
  p_keywords      text[],
  p_status        text,
  p_shortcode     text,
  p_post_year     int,
  p_satisfaction  smallint,
  p_pain          smallint,
  p_revisit       text,
  p_effect_areas  text[] DEFAULT NULL
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
  IF EXISTS (SELECT 1 FROM public.procedure_reviews WHERE author_id = p_author_id AND procedure_ko = p_procedure_ko) THEN
    RAISE EXCEPTION 'duplicate_review' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
  VALUES ('review'::qa_type, 'review', p_author_id, p_title, COALESCE(p_body,''),
          COALESCE(p_keywords, ARRAY[p_procedure_ko]), p_status::qa_status, p_shortcode, p_post_year)
  RETURNING id INTO v_card_id;

  INSERT INTO public.procedure_reviews
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas);

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[]) TO authenticated;
