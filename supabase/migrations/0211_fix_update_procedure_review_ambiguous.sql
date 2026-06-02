-- 0211: update_procedure_review 의 모호한 컬럼 참조(42702) 수정
--
-- 버그: RETURNS TABLE(card_id bigint, ...) 의 OUT 컬럼 card_id 가 함수 스코프 변수로 잡혀,
--   `UPDATE procedure_reviews ... WHERE card_id = v_card_id` 의 card_id 가 OUT 변수와 테이블
--   컬럼 사이에서 모호(ERROR 42702). → 저장 실패(save_failed 500).
-- 수정: WHERE 절 컬럼을 테이블명으로 한정(procedure_reviews.card_id / cards.id). 시그니처 동일 →
--   CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.update_procedure_review(
  p_shortcode text,
  p_title text,
  p_body text,
  p_keywords text[],
  p_status text,
  p_satisfaction smallint,
  p_pain smallint,
  p_revisit text,
  p_effect_areas text[] DEFAULT NULL::text[]
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
      updated_at = now()
  WHERE public.procedure_reviews.card_id = v_card_id;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;
