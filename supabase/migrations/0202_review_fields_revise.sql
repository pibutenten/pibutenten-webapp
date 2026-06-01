-- 0202: 시술후기 항목 재정의 — effect/would_recommend 제거 (P3-d 보정)
--
-- 원장님 확정: 점수는 만족도·통증·회복기간만. 효과체감(점수)·추천의향 제거.
-- 효과 체감 분야는 effect_areas(온보딩 피부고민 10종)로 유지. area/cost_satisfaction 컬럼은 보존(폼에선 미노출).
-- 빈 테이블이라 컬럼 DROP 안전. RPC 시그니처 변경 → DROP 후 재생성.

ALTER TABLE public.procedure_reviews DROP COLUMN IF EXISTS effect;
ALTER TABLE public.procedure_reviews DROP COLUMN IF EXISTS would_recommend;

DROP FUNCTION IF EXISTS public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,smallint,boolean,text,smallint,text[]);

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
  p_pain             smallint,
  p_recovery_days    smallint,
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
    (card_id, procedure_ko, author_id, satisfaction, pain, recovery_days, area, cost_satisfaction, effect_areas)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_recovery_days, p_area, p_cost_satisfaction, p_effect_areas);

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,text,smallint,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,text,smallint,text[]) TO authenticated;
