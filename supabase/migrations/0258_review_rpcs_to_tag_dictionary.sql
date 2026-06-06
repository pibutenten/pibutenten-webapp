-- 0258. 시술 후기/리포트 RPC 6개 SSOT 전환 (C-Phase2 STEP 2)
--   procedure_taxonomy → tag_dictionary(is_procedure=true). active → is_procedure.
--   category 는 tag_dictionary 값(한글: 리프팅/스킨부스터)으로 반환됨(코드가 한글 처리).
--   sort_order 는 tag_dictionary.sort_order(0257 이관).
--   CREATE OR REPLACE — 시그니처·반환 동일, 본문만 전환. (procedure_taxonomy 는 0259 에서 DROP.)

-- 1) procedure_family(p_ko) — 자기 + 직속 자식 시술 ko
CREATE OR REPLACE FUNCTION public.procedure_family(p_ko text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY[p_ko] || COALESCE(
    (SELECT array_agg(ko)
       FROM public.tag_dictionary
      WHERE parent_ko = p_ko AND is_procedure),
    ARRAY[]::text[]
  );
$function$;

-- 2) create_procedure_review
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
  IF NOT EXISTS (SELECT 1 FROM public.tag_dictionary WHERE ko = p_procedure_ko AND is_procedure) THEN
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

-- 3) update_procedure_review
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

  -- published 면 자기 + 부모 리포트 lazy 생성(이미 있으면 무동작). 리포트는 published.
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

-- 4) get_review_report_overview (admin)
CREATE OR REPLACE FUNCTION public.get_review_report_overview()
 RETURNS TABLE(en text, ko text, category text, sort_order integer, review_count bigint, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint, sat_avg numeric, pain_avg numeric, view_count integer, save_count integer, share_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.post_slug,
    t.ko,
    -- tag_dictionary 한글 분류 → 시술 영문 slug(기존 reports·테마·schema 정합 유지). 교차 2건은 tag_dict 기준 자동 정정.
    (CASE t.category WHEN '리프팅' THEN 'lifting' WHEN '스킨부스터' THEN 'injectables' ELSE 'knowledge' END),
    t.sort_order,
    agg.review_count,
    agg.revisit_yes,
    agg.revisit_maybe,
    agg.revisit_no,
    agg.sat_avg,
    agg.pain_avg,
    c.view_count,
    c.save_count,
    c.share_count
  FROM public.cards c
  JOIN public.tag_dictionary t ON t.en = c.post_slug AND t.is_procedure
  JOIN LATERAL (
    SELECT
      count(*) AS review_count,
      avg(pr.satisfaction)::numeric AS sat_avg,
      avg(pr.pain)::numeric AS pain_avg,
      count(*) FILTER (WHERE pr.revisit = 'yes')   AS revisit_yes,
      count(*) FILTER (WHERE pr.revisit = 'maybe') AS revisit_maybe,
      count(*) FILTER (WHERE pr.revisit = 'no')    AS revisit_no
    FROM public.procedure_reviews pr
    JOIN public.cards rc ON rc.id = pr.card_id
    WHERE pr.procedure_ko = ANY(public.procedure_family(t.ko))
      AND rc.type = 'review'::qa_type
      AND rc.status = 'published'
      AND rc.deleted_at IS NULL
  ) agg ON true
  WHERE c.type = 'review_summary'::qa_type
    AND c.status = 'published'
    AND c.deleted_at IS NULL
    AND agg.review_count > 0
  ORDER BY t.category, t.sort_order, t.ko;
END;
$function$;

-- 5) get_review_summary_pool
CREATE OR REPLACE FUNCTION public.get_review_summary_pool()
 RETURNS TABLE(anchor_card_id bigint, anchor_title text, en text, ko text, category text, like_count integer, save_count integer, share_count integer, review_count bigint, sat_avg numeric, sat_dist integer[], pain_avg numeric, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id, c.title, c.post_slug, t.ko,
    (CASE t.category WHEN '리프팅' THEN 'lifting' WHEN '스킨부스터' THEN 'injectables' ELSE 'knowledge' END),
    c.like_count, c.save_count, c.share_count,
    agg.review_count, agg.sat_avg, agg.sat_dist, agg.pain_avg,
    agg.revisit_yes, agg.revisit_maybe, agg.revisit_no
  FROM public.cards c
  JOIN public.tag_dictionary t ON t.en = c.post_slug AND t.is_procedure
  JOIN LATERAL (
    SELECT
      count(*) AS review_count,
      avg(pr.satisfaction)::numeric AS sat_avg,
      ARRAY[
        count(*) FILTER (WHERE pr.satisfaction = 1),
        count(*) FILTER (WHERE pr.satisfaction = 2),
        count(*) FILTER (WHERE pr.satisfaction = 3),
        count(*) FILTER (WHERE pr.satisfaction = 4),
        count(*) FILTER (WHERE pr.satisfaction = 5)
      ]::integer[] AS sat_dist,
      avg(pr.pain)::numeric AS pain_avg,
      count(*) FILTER (WHERE pr.revisit = 'yes')   AS revisit_yes,
      count(*) FILTER (WHERE pr.revisit = 'maybe') AS revisit_maybe,
      count(*) FILTER (WHERE pr.revisit = 'no')    AS revisit_no
    FROM public.procedure_reviews pr
    JOIN public.cards rc ON rc.id = pr.card_id
    WHERE pr.procedure_ko = ANY(public.procedure_family(t.ko))
      AND rc.type = 'review'::qa_type
      AND rc.status = 'published'
      AND rc.deleted_at IS NULL
  ) agg ON true
  WHERE c.type = 'review_summary'::qa_type
    AND c.status = 'published'
    AND c.deleted_at IS NULL
    AND agg.review_count > 0;
$function$;
