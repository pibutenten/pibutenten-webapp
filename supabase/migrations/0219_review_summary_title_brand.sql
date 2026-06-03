-- 0219: 시술 리포트 앵커 title 브랜드 통일 ("피부텐텐 리포트 | {ko}")
--
-- 배경: 앵커 title 이 "{ko} 시술 리포트" 라 og/공유·admin 에서 브랜드 일관성 부족.
--   "피부텐텐 리포트 | {ko}" 로 통일. (1) 기존 25행 UPDATE (2) create/update_procedure_review
--   의 앵커 lazy INSERT title 템플릿 변경(나머지 본문은 라이브 정의 VERBATIM, 제목 한 곳만 치환).
--   CREATE OR REPLACE 라 시그니처·ACL·SECURITY DEFINER 보존. 카드 eyebrow("피부텐텐 리포트")는
--   컴포넌트 하드코딩이라 무관.
-- ★롤백: title 을 (keywords[1]||' 시술 리포트')로 되돌리고 RPC 재정의(이전 def). 데이터만 영향.

BEGIN;

-- (1) 기존 앵커 25행 title 브랜드화
UPDATE public.cards c
SET title = '피부텐텐 리포트 | ' || t.ko,
    updated_at = now()
FROM public.procedure_taxonomy t
WHERE c.type = 'review_summary'::qa_type
  AND c.post_slug = t.en;

-- (2) create_procedure_review — 라이브 VERBATIM + 앵커 title 템플릿만 변경
CREATE OR REPLACE FUNCTION public.create_procedure_review(p_author_id uuid, p_procedure_ko text, p_title text, p_body text, p_keywords text[], p_status text, p_shortcode text, p_post_year integer, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text)
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

  -- [C1 추가] 발행이면 해당 시술 앵커(review_summary) lazy 생성(없을 때만, 멱등).
  --   앵커 자체는 'draft'(비공개) — 공개는 C2~ 완비 후 별도 플립. 기존 로직 불변.
  IF p_status = 'published' THEN
    INSERT INTO public.cards
      (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
    SELECT
      'review_summary'::qa_type, 'review_summary',
      (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
      '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'draft'::qa_status, t.en, false
    FROM public.procedure_taxonomy t
    WHERE t.ko = p_procedure_ko AND t.en IS NOT NULL
    ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $function$
;

-- (2) update_procedure_review — 라이브 VERBATIM + 앵커 title 템플릿만 변경
CREATE OR REPLACE FUNCTION public.update_procedure_review(p_shortcode text, p_title text, p_body text, p_keywords text[], p_status text, p_satisfaction smallint, p_pain smallint, p_revisit text, p_effect_areas text[] DEFAULT NULL::text[], p_downtime text DEFAULT NULL::text, p_effect_onset text DEFAULT NULL::text)
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

  UPDATE public.procedure_reviews
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      downtime = p_downtime,
      effect_onset = p_effect_onset,
      updated_at = now()
  WHERE public.procedure_reviews.card_id = v_card_id;

  -- [C1 추가] 수정으로 published 가 된 경우에도 해당 시술 앵커 lazy 생성(없을 때만, 멱등).
  --   procedure_ko 는 update 시그니처에 없으므로 이 후기의 procedure_reviews 행에서 파생.
  --   앵커는 'draft'(비공개). 기존 로직 불변.
  IF p_status = 'published' THEN
    SELECT pr.procedure_ko INTO v_procedure_ko
    FROM public.procedure_reviews pr
    WHERE pr.card_id = v_card_id;

    IF v_procedure_ko IS NOT NULL THEN
      INSERT INTO public.cards
        (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
      SELECT
        'review_summary'::qa_type, 'review_summary',
        (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
        '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'draft'::qa_status, t.en, false
      FROM public.procedure_taxonomy t
      WHERE t.ko = v_procedure_ko AND t.en IS NOT NULL
      ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$
;

COMMIT;
