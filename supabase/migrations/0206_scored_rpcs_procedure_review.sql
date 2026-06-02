-- 0206: 정렬 RPC(feed/search)에 procedure_review 요약 임베드 추가 (P3 후기 피드 노출)
--
-- 배경: 시술후기(type=review) 카드의 정량 요약(만족도·통증·재시술 의향·효과·시술명)은
--   별도 1:1 테이블 procedure_reviews 에 저장된다. 마이페이지·단독 글은 PostgREST 임베드
--   (CARD_LIST_SELECT / CARD_DETAIL_SELECT)로 함께 읽어 요약 박스를 보여주지만, 메인 피드·
--   검색은 점수계산 RPC(feed_cards_scored / search_cards_scored)로 cards 만 읽어와 요약값이
--   비어 있었다 → 피드/검색에서 후기 요약 텍스트가 안 보이는 회귀.
-- 변경: 두 RPC 의 RETURNS TABLE 끝에 procedure_review jsonb 컬럼을 추가하고, 외부 SELECT 에
--   LEFT JOIN public.procedure_reviews 로 1:1 조인하여 satisfaction/pain/revisit/effect_areas/
--   procedure_ko 를 jsonb_build_object 로 묶어 반환. 점수공식·정렬·기타 로직은 0197 그대로.
-- 효과: 피드·검색에서도 후기 카드가 CARD_LIST_SELECT 임베드와 동일한 procedure_review 객체를
--   받아 ReviewSummary 텍스트를 표시. card_id UNIQUE 조인이라 행 증식 없음.
-- 참고: tag_cards_scored 는 category IN ('qa','tip') 만 반환(후기 제외)하므로 대상 아님.

-- ===== feed_cards_scored =====
DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric);
CREATE OR REPLACE FUNCTION public.feed_cards_scored(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_half_life_days numeric DEFAULT 14, p_jitter_amp numeric DEFAULT 0.2)
 RETURNS TABLE(id bigint, title text, body text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, status text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, pubmed_refs jsonb[], score numeric, created_at timestamp with time zone, reviewed_at timestamp with time zone, procedure_review jsonb)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.title, c.body, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at, c.reviewed_at,
      c.type::text AS type_text,
      c.status::text AS status_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential,
      c.pubmed_refs,
      (
        (ln(greatest(
          coalesce(c.like_count, 0)
          + coalesce(c.view_count, 0) / 10.0
          + coalesce(c.save_count, 0) * 2.0
          + coalesce(c.share_count, 0) * 2.0
          + coalesce(cmt.cc, 0) * 2.0
        , 1)) / ln(10.0) + 1.0)
        * exp(- extract(epoch from (now() - COALESCE(c.reviewed_at, c.created_at)))
              / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0)))
        * CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric
      + (1.5 * power(0.5, extract(epoch from (now() - COALESCE(c.reviewed_at, c.created_at))) / 3600.0))::numeric
      AS score
    FROM public.cards c
    LEFT JOIN (
      SELECT card_id, count(*)::numeric AS cc
      FROM public.comments cm2
      WHERE cm2.status = 'visible'
      GROUP BY card_id
    ) cmt ON cmt.card_id = c.id
    WHERE c.status = 'published'
      AND c.deleted_at IS NULL
  )
  SELECT
    s.id, s.title, s.body, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count,
    CASE WHEN d.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) END AS doctor,
    CASE WHEN v.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) END AS video,
    CASE WHEN p.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'handle', p.handle, 'updated_at', p.updated_at) END AS author,
    s.type_text AS type,
    s.status_text AS status,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.pubmed_refs,
    s.score, s.created_at, s.reviewed_at,
    CASE WHEN pr.card_id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object(
        'satisfaction', pr.satisfaction,
        'pain', pr.pain,
        'revisit', pr.revisit,
        'effect_areas', pr.effect_areas,
        'procedure_ko', pr.procedure_ko) END AS procedure_review
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  LEFT JOIN public.procedure_reviews pr ON pr.card_id = s.id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

-- ===== search_cards_scored =====
DROP FUNCTION IF EXISTS public.search_cards_scored(text, text, integer, integer, text);
CREATE OR REPLACE FUNCTION public.search_cards_scored(p_q text DEFAULT ''::text, p_doctor_slug text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20, p_boost_doctor_slug text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, title text, body text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, pubmed_refs jsonb[], score numeric, created_at timestamp with time zone, reviewed_at timestamp with time zone, procedure_review jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_words text[]; v_doctor_id uuid; v_boost_doctor_id uuid;
BEGIN
  v_words := array_remove(string_to_array(lower(coalesce(trim(p_q), '')), ' '), '');
  IF p_doctor_slug IS NOT NULL AND p_doctor_slug <> '' THEN
    SELECT d.id INTO v_doctor_id FROM public.doctors d WHERE d.slug = p_doctor_slug;
    IF v_doctor_id IS NULL THEN RETURN; END IF;
  END IF;
  IF p_boost_doctor_slug IS NOT NULL AND p_boost_doctor_slug <> '' THEN
    SELECT d.id INTO v_boost_doctor_id FROM public.doctors d WHERE d.slug = p_boost_doctor_slug;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.title, c.body, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at, c.reviewed_at,
      c.type::text AS type_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential, c.pubmed_refs,
      (
        (CASE WHEN array_length(v_words, 1) > 0 THEN
          (SELECT count(*)::numeric FROM unnest(v_words) w
            WHERE lower(c.title) ILIKE '%' || w || '%'
               OR lower(c.body) ILIKE '%' || w || '%'
               OR EXISTS (SELECT 1 FROM unnest(c.keywords) kw WHERE lower(kw) ILIKE '%' || w || '%'))
         ELSE 0 END)
        + (ln(greatest(
            coalesce(c.like_count, 0)
            + coalesce(c.view_count, 0) / 10.0
            + coalesce(c.save_count, 0) * 2.0
            + coalesce(c.share_count, 0) * 2.0
            + coalesce(cmt.cc, 0) * 2.0
          , 1)) / ln(10.0))
        + CASE WHEN c.doctor_id = v_boost_doctor_id THEN 2.0 ELSE 0 END
        + (1.5 * power(0.5, extract(epoch from (now() - COALESCE(c.reviewed_at, c.created_at))) / 3600.0))
      )::numeric AS score
    FROM public.cards c
    LEFT JOIN (
      SELECT card_id, count(*)::numeric AS cc
      FROM public.comments cm2
      WHERE cm2.status = 'visible'
      GROUP BY card_id
    ) cmt ON cmt.card_id = c.id
    WHERE c.status = 'published'
      AND c.deleted_at IS NULL
      AND (v_doctor_id IS NULL OR c.doctor_id = v_doctor_id)
      AND (
        array_length(v_words, 1) IS NULL
        OR EXISTS (SELECT 1 FROM unnest(v_words) w
          WHERE lower(c.title) ILIKE '%' || w || '%'
             OR lower(c.body) ILIKE '%' || w || '%'
             OR EXISTS (SELECT 1 FROM unnest(c.keywords) kw WHERE lower(kw) ILIKE '%' || w || '%'))
      )
  )
  SELECT
    s.id, s.title, s.body, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count,
    CASE WHEN d.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) END AS doctor,
    CASE WHEN v.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) END AS video,
    CASE WHEN p.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'handle', p.handle) END AS author,
    s.type_text AS type,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.pubmed_refs,
    s.score, s.created_at, s.reviewed_at,
    CASE WHEN pr.card_id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object(
        'satisfaction', pr.satisfaction,
        'pain', pr.pain,
        'revisit', pr.revisit,
        'effect_areas', pr.effect_areas,
        'procedure_ko', pr.procedure_ko) END AS procedure_review
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  LEFT JOIN public.procedure_reviews pr ON pr.card_id = s.id
  ORDER BY s.score DESC, COALESCE(s.reviewed_at, s.created_at) DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;
