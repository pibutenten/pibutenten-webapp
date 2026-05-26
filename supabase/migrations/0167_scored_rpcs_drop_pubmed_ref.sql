-- 0167: scored RPCs (search/feed/tag) 에서 옛 pubmed_ref 컬럼 참조 제거
--
-- 0166 에서 cards.pubmed_ref 컬럼을 DROP 했으나 3개 scored RPC 본문이 여전히
-- `c.pubmed_ref` 를 SELECT → /api/cards 가 500 에러 (피드 빈 화면).
--
-- 본 마이그레이션: 3개 RPC 의 RETURNS TABLE 과 본문에서 pubmed_ref 단수 컬럼 제거.
-- 클라이언트는 이미 pubmed_refs (배열) 만 사용하므로 호환.

BEGIN;

-- ─── feed_cards_scored ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric);
CREATE OR REPLACE FUNCTION public.feed_cards_scored(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_half_life_days numeric DEFAULT 14, p_jitter_amp numeric DEFAULT 0.2)
 RETURNS TABLE(id bigint, question text, answer text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, status text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, score numeric, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.question, c.answer, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at,
      c.type::text AS type_text,
      c.status::text AS status_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential,
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

-- ─── search_cards_scored ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_cards_scored(text, text, integer, integer, text);
CREATE OR REPLACE FUNCTION public.search_cards_scored(p_q text DEFAULT ''::text, p_doctor_slug text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20, p_boost_doctor_slug text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, question text, answer text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, pubmed_refs jsonb[], score numeric, created_at timestamp with time zone)
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
      c.id, c.question, c.answer, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at,
      c.type::text AS type_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential, c.pubmed_refs,
      (
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC, s.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.feed_cards_scored(integer, integer, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_cards_scored(text, text, integer, integer, text) TO anon, authenticated;

COMMIT;
