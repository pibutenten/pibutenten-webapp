-- 0310. update_procedure_review 에 p_recommend smallint DEFAULT NULL 추가.
--
--   create_procedure_review 는 0303 에서 p_recommend 를 추가했으나
--   update_procedure_review 는 누락. 수정 경로에서도 recommend 를 DB 에 반영하도록 확장.
--
--   새 파라미터가 끝에 DEFAULT NULL 로 붙으므로 기존 11인자 호출도 깨지지 않는다.
--   단, 시그니처(인자 목록)가 달라 CREATE OR REPLACE 가 실패하므로
--   기존 11인자 함수를 DROP 한 뒤 12인자로 재생성한다.
--
--   한국어 미포함 — curl/PowerShell 적용 가능.

BEGIN;

-- 기존 11인자 시그니처 DROP (없으면 무동작).
DROP FUNCTION IF EXISTS public.update_procedure_review(
  text, text, text, text[], text, smallint, smallint, text, text[], text, text
);

-- 12인자로 재생성.
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
  p_downtime text DEFAULT NULL::text,
  p_effect_onset text DEFAULT NULL::text,
  p_recommend smallint DEFAULT NULL::smallint
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
      downtime = p_downtime,
      effect_onset = p_effect_onset,
      recommend = COALESCE(p_recommend, pr.recommend),
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

-- GRANT 재부여.
GRANT EXECUTE ON FUNCTION public.update_procedure_review(
  text, text, text, text[], text, smallint, smallint, text, text[], text, text, smallint
) TO authenticated;

COMMIT;
