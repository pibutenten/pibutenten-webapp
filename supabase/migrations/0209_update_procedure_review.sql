-- 0209: 시술후기 수정 RPC (update_procedure_review)
--
-- 배경: 시술후기 "수정"이 일반 글 에디터(/write)로 가던 문제 해결 — 후기 전용 에디터에서
--   수정 시 cards(title/body/keywords/status) + procedure_reviews(satisfaction/pain/revisit/
--   effect_areas) 를 원자적으로 갱신한다. create_procedure_review 를 미러링.
-- 권한: 작성자 본인(card.author_id ↔ auth.uid()) 또는 admin 명함만. SECURITY DEFINER.
-- 잠금: procedure_ko(시술명)·author_id 는 수정 불가(시술 변경 금지 — 사용자 정책 [66]).
-- 라우트가 마스킹·소프트검수 후 p_status 결정해서 호출(create 와 동일).

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
      keywords = COALESCE(p_keywords, keywords),
      status = p_status::qa_status,
      updated_at = now()
  WHERE id = v_card_id;

  UPDATE public.procedure_reviews
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      updated_at = now()
  WHERE card_id = v_card_id;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;

GRANT EXECUTE ON FUNCTION public.update_procedure_review(text, text, text, text[], text, smallint, smallint, text, text[]) TO authenticated;
