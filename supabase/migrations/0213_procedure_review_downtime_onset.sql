-- 0213: 시술후기에 다운타임(downtime)·효과시기(effect_onset) 추가 + RPC 확장 (폼 확장 2a)
--
-- 배경: 후기 폼에 '일상 복귀 소요(downtime)' · '효과 체감 시기(effect_onset)' 입력 추가.
-- 저장은 영문 슬러그(revisit 패턴), 한국어는 폼·리포트에서 표시. 두 컬럼 nullable —
--   기존 69건은 NULL 유지(과거 후기엔 해당 입력이 없었음). CHECK 는 revisit_chk 스타일(NULL 허용:
--   `col = ANY(...)` 는 col IS NULL 일 때 NULL → CHECK 통과).
-- RPC: create_procedure_review·update_procedure_review 둘 다 DROP + 재생성. 시그니처 끝에만
--   p_downtime/p_effect_onset(DEFAULT NULL) 추가. 기존 소유자검증·cards INSERT·shortcode·FK·
--   status 로직은 불변(0205 create 본문 / 0211 update 본문 그대로). 마스킹은 라우트 책임(불변).
-- DROP으로 사라지는 GRANT 는 원본과 동일하게 재발급(create=REVOKE+GRANT / update=GRANT).

BEGIN;

-- ── 컬럼 추가 (nullable) ──
ALTER TABLE public.procedure_reviews
  ADD COLUMN IF NOT EXISTS downtime     text,
  ADD COLUMN IF NOT EXISTS effect_onset text;

-- ── CHECK (NULL 허용) ──
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_downtime_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_downtime_chk
  CHECK (downtime = ANY (ARRAY['same_day','days_1_2','days_3_5','week_1','weeks_2_plus']));
ALTER TABLE public.procedure_reviews DROP CONSTRAINT IF EXISTS procedure_reviews_effect_onset_chk;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_effect_onset_chk
  CHECK (effect_onset = ANY (ARRAY['immediate','weeks_1_2','month_1','months_2_3','still_watching']));

-- ── create_procedure_review: DROP(구 12-arg) + 재생성(+p_downtime,p_effect_onset) ──
DROP FUNCTION IF EXISTS public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[]);

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
  p_effect_areas  text[] DEFAULT NULL,
  p_downtime      text   DEFAULT NULL,
  p_effect_onset  text   DEFAULT NULL
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
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset);

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[],text,text) TO authenticated;

-- ── update_procedure_review: DROP(구 9-arg) + 재생성(+p_downtime,p_effect_onset) ──
DROP FUNCTION IF EXISTS public.update_procedure_review(text,text,text,text[],text,smallint,smallint,text,text[]);

CREATE OR REPLACE FUNCTION public.update_procedure_review(
  p_shortcode text,
  p_title text,
  p_body text,
  p_keywords text[],
  p_status text,
  p_satisfaction smallint,
  p_pain smallint,
  p_revisit text,
  p_effect_areas text[] DEFAULT NULL::text[],
  p_downtime text DEFAULT NULL,
  p_effect_onset text DEFAULT NULL
)
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_author uuid;
  v_is_admin boolean;
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

  UPDATE public.procedure_reviews
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      downtime = p_downtime,
      effect_onset = p_effect_onset,
      updated_at = now()
  WHERE public.procedure_reviews.card_id = v_card_id;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;

GRANT EXECUTE ON FUNCTION public.update_procedure_review(text,text,text,text[],text,smallint,smallint,text,text[],text,text) TO authenticated;

COMMIT;
