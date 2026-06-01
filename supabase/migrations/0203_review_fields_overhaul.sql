-- 0203: 시술후기 항목 전면 개편 (P3 명세 확정본)
--
-- 원장님 명세: 필수 만족도·통증·다운타임(구간)·회차·받은시점·재시술의향 / 선택 가성비·효과부위·병행시술·이상반응·한줄후기(유형).
-- 중복 발행 금지: UNIQUE(author_id, procedure_ko). 빈 테이블이라 컬럼 개편 안전.

ALTER TABLE public.procedure_reviews DROP COLUMN IF EXISTS recovery_days;

ALTER TABLE public.procedure_reviews
  ADD COLUMN IF NOT EXISTS downtime              text,
  ADD COLUMN IF NOT EXISTS sessions              text,
  ADD COLUMN IF NOT EXISTS timing                text,
  ADD COLUMN IF NOT EXISTS revisit               text,
  ADD COLUMN IF NOT EXISTS concurrent_procedures text[],
  ADD COLUMN IF NOT EXISTS adverse_reactions     text[],
  ADD COLUMN IF NOT EXISTS oneliner_type         text;

-- 필수 4구간 NOT NULL + 값 제약
ALTER TABLE public.procedure_reviews
  ALTER COLUMN downtime SET NOT NULL,
  ALTER COLUMN sessions SET NOT NULL,
  ALTER COLUMN timing   SET NOT NULL,
  ALTER COLUMN revisit  SET NOT NULL;

ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_downtime_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_downtime_chk CHECK (downtime IN ('none','d1_2','d3_5','w1plus'));
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_sessions_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_sessions_chk CHECK (sessions IN ('s1','s2_3','s4plus'));
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_timing_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_timing_chk CHECK (timing IN ('w2','m1_3','m3plus'));
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_revisit_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_revisit_chk CHECK (revisit IN ('yes','maybe','no'));
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_oneliner_type_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_oneliner_type_chk CHECK (oneliner_type IS NULL OR oneliner_type IN ('recommend','caution','etc'));

-- 중복 발행 금지(수정은 UPDATE). 한 명함이 한 시술에 후기 1개.
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_author_procedure_uniq;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_author_procedure_uniq UNIQUE (author_id, procedure_ko);

-- RPC 재정의 (이전 시그니처 제거 후 신규)
DROP FUNCTION IF EXISTS public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,smallint,text,smallint,text[]);

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
  p_downtime         text,
  p_sessions         text,
  p_timing           text,
  p_revisit          text,
  p_cost_satisfaction      smallint DEFAULT NULL,
  p_effect_areas           text[]   DEFAULT NULL,
  p_concurrent_procedures  text[]   DEFAULT NULL,
  p_adverse_reactions      text[]   DEFAULT NULL,
  p_oneliner_type          text     DEFAULT NULL
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
    (card_id, procedure_ko, author_id, satisfaction, pain, downtime, sessions, timing, revisit,
     cost_satisfaction, effect_areas, concurrent_procedures, adverse_reactions, oneliner_type)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_downtime, p_sessions, p_timing, p_revisit,
     p_cost_satisfaction, p_effect_areas, p_concurrent_procedures, p_adverse_reactions, p_oneliner_type);

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text,text,text,smallint,text[],text[],text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text,text,text,smallint,text[],text[],text[],text) TO authenticated;
