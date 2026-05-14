-- 0072: feed/search/tag scored RPC 들 cards 직접 참조로 재작성 + 함수명 rename

-- DROP old qa-named functions
DROP FUNCTION IF EXISTS public.feed_qas_scored(integer, integer, numeric, numeric);
DROP FUNCTION IF EXISTS public.search_qas_scored(text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.tag_qas_scored(text, integer, integer, numeric, numeric);

-- feed_cards_scored
CREATE OR REPLACE FUNCTION public.feed_cards_scored(
  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14, p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, question text, answer text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  rating_avg numeric, rating_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, posted_as text, post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean, shortcode text, pubmed_ref jsonb,
  score numeric, created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.question, c.answer, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.rating_avg, c.rating_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at,
      c.type::text AS type_text,
      c.posted_as::text AS posted_as_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential, c.pubmed_ref,
      (
        (ln(greatest(
          coalesce(c.like_count, 0) + coalesce(c.view_count, 0) / 10.0
          + coalesce(c.save_count, 0) * 2.0, 1
        )) / ln(10.0) + 1.0)
        * exp(- extract(epoch from (now() - c.created_at))
              / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0)))
        * CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric AS score
    FROM public.cards c
    WHERE c.status = 'published'
  )
  SELECT
    s.id, s.question, s.answer, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count, s.rating_avg, s.rating_count,
    CASE WHEN d.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) END AS doctor,
    CASE WHEN v.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) END AS video,
    CASE WHEN p.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'alt_display_name', p.alt_display_name, 'alt_avatar_url', p.alt_avatar_url,
        'handle', p.handle, 'alt_handle', p.alt_handle, 'updated_at', p.updated_at) END AS author,
    s.type_text AS type, s.posted_as_text AS posted_as,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode, s.pubmed_ref,
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.feed_cards_scored(integer, integer, numeric, numeric) TO authenticated, anon;

-- search_cards_scored
CREATE OR REPLACE FUNCTION public.search_cards_scored(
  p_q text DEFAULT '',
  p_doctor_slug text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20,
  p_boost_doctor_slug text DEFAULT NULL
)
RETURNS TABLE(
  id bigint, question text, answer text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  rating_avg numeric, rating_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, posted_as text, post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean, shortcode text,
  pubmed_ref jsonb, pubmed_refs jsonb[],
  score numeric, created_at timestamptz
)
LANGUAGE plpgsql STABLE
AS $$
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
      c.id, c.question, c.answer, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count, c.rating_avg, c.rating_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at,
      c.type::text AS type_text, c.posted_as::text AS posted_as_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential, c.pubmed_ref, c.pubmed_refs,
      (
        -- 검색 매칭 점수
        (CASE WHEN array_length(v_words, 1) > 0 THEN
          (SELECT count(*)::numeric FROM unnest(v_words) w
            WHERE lower(c.question) ILIKE '%' || w || '%'
               OR lower(c.answer) ILIKE '%' || w || '%'
               OR EXISTS (SELECT 1 FROM unnest(c.keywords) kw WHERE lower(kw) ILIKE '%' || w || '%'))
         ELSE 0 END)
        + (ln(greatest(coalesce(c.like_count, 0) + coalesce(c.view_count, 0) / 10.0, 1)) / ln(10.0))
        + CASE WHEN c.doctor_id = v_boost_doctor_id THEN 2.0 ELSE 0 END
      )::numeric AS score
    FROM public.cards c
    WHERE c.status = 'published'
      AND (v_doctor_id IS NULL OR c.doctor_id = v_doctor_id)
      AND (
        array_length(v_words, 1) IS NULL
        OR EXISTS (SELECT 1 FROM unnest(v_words) w
          WHERE lower(c.question) ILIKE '%' || w || '%'
             OR lower(c.answer) ILIKE '%' || w || '%'
             OR EXISTS (SELECT 1 FROM unnest(c.keywords) kw WHERE lower(kw) ILIKE '%' || w || '%'))
      )
  )
  SELECT
    s.id, s.question, s.answer, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count, s.rating_avg, s.rating_count,
    CASE WHEN d.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) END AS doctor,
    CASE WHEN v.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) END AS video,
    CASE WHEN p.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'alt_display_name', p.alt_display_name, 'alt_avatar_url', p.alt_avatar_url,
        'handle', p.handle, 'alt_handle', p.alt_handle) END AS author,
    s.type_text AS type, s.posted_as_text AS posted_as,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.pubmed_ref, s.pubmed_refs,
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC, s.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_cards_scored(text, text, integer, integer, text) TO authenticated, anon;

-- tag_cards_scored
CREATE OR REPLACE FUNCTION public.tag_cards_scored(
  p_tag text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14, p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, question text, answer text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer, share_count integer,
  rating_avg numeric, rating_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, posted_as text, post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean, shortcode text,
  score numeric, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.question, c.answer, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count, c.share_count,
      c.rating_avg, c.rating_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at, c.updated_at,
      c.type::text AS type_text, c.posted_as::text AS posted_as_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential,
      (
        (ln(greatest(coalesce(c.like_count, 0) + coalesce(c.view_count, 0) / 10.0
          + coalesce(c.save_count, 0) * 2.0, 1)) / ln(10.0) + 1.0)
        * exp(- extract(epoch from (now() - c.created_at))
              / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0)))
        * CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric AS score
    FROM public.cards c
    WHERE c.status = 'published' AND c.posted_as = 'official'
      AND c.category IN ('qa', 'tip') AND c.doctor_id IS NOT NULL
      AND p_tag = ANY(c.keywords)
  )
  SELECT
    s.id, s.question, s.answer, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count, s.share_count,
    s.rating_avg, s.rating_count,
    CASE WHEN d.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) END AS doctor,
    CASE WHEN v.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) END AS video,
    CASE WHEN p.id IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'alt_display_name', p.alt_display_name, 'alt_avatar_url', p.alt_avatar_url,
        'handle', p.handle, 'alt_handle', p.alt_handle) END AS author,
    s.type_text AS type, s.posted_as_text AS posted_as,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.score, s.created_at, s.updated_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tag_cards_scored(text, integer, integer, numeric, numeric) TO authenticated, anon;

SELECT 'OK 0072' AS status;
