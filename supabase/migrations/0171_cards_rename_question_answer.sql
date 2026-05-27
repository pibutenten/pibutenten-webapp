-- 0171_cards_rename_question_answer.sql
--
-- P2-4 (2026-05-27) — cards.question → title, cards.answer → body 리네임.
--
-- 배경:
--   cards 테이블은 Q&A 외에도 끄적끄적·피부일기·피부꿀팁·궁금해요·소식공유 등
--   범용 글을 담는다. v5.2 spec (2026-05-15) 부터 type=post 가 도입됐고, "질문/답변"
--   이름은 더 이상 의미를 정확히 반영하지 않음 → 범용 title/body 로 리네임.
--
-- 변경 범위:
--   1. cards 테이블 컬럼 RENAME (question → title, answer → body) — 데이터 보존.
--   2. trgm GIN 인덱스 2개 이름 변경.
--   3. cards 를 참조하는 RPC 10개 재정의:
--       - feed_cards_scored
--       - search_cards_scored
--       - tag_cards_scored
--       - get_notifications (반환 alias card_question → card_title 도 변경)
--       - get_top_cards_by_{comments|likes|saves|shares|views}_inner
--       - get_top_new_cards_inner
--   4. View public_profiles_view 영향 없음 (cards 미참조).
--   5. RLS policies / 트리거 함수 영향 없음 (question/answer 미참조).
--
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. 컬럼 RENAME ──────────────────────────────────────────────────────────
ALTER TABLE public.cards RENAME COLUMN question TO title;
ALTER TABLE public.cards RENAME COLUMN answer   TO body;

-- ── 2. 인덱스 RENAME ────────────────────────────────────────────────────────
ALTER INDEX public.cards_question_trgm_idx RENAME TO cards_title_trgm_idx;
ALTER INDEX public.cards_answer_trgm_idx   RENAME TO cards_body_trgm_idx;

-- ── 3. RPC 재정의 ───────────────────────────────────────────────────────────
-- PostgreSQL 의 RENAME COLUMN 은 함수 본문/반환 타입을 자동 갱신하지 않으므로
-- CREATE OR REPLACE 로 시그니처·본문 모두 재정의.
--
-- 반환 시그니처가 달라지는 경우(question text → title text)는 OR REPLACE 가
-- 작동하지 않을 수 있어 DROP + CREATE 순서로 처리.

-- 3.1 feed_cards_scored ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric);
CREATE OR REPLACE FUNCTION public.feed_cards_scored(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, title text, body text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, status text,
  post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean,
  shortcode text, pubmed_refs jsonb[],
  score numeric, created_at timestamptz
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.title, c.body, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at,
      c.type::text AS type_text,
      c.status::text AS status_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential,
      c.pubmed_refs,
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

-- 3.2 search_cards_scored ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_cards_scored(text, text, integer, integer, text);
CREATE OR REPLACE FUNCTION public.search_cards_scored(
  p_q text DEFAULT ''::text,
  p_doctor_slug text DEFAULT NULL::text,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20,
  p_boost_doctor_slug text DEFAULT NULL::text
)
RETURNS TABLE(
  id bigint, title text, body text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean,
  shortcode text, pubmed_refs jsonb[],
  score numeric, created_at timestamptz
)
LANGUAGE plpgsql STABLE
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
      c.doctor_id, c.video_id, c.author_id, c.created_at,
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
        + (ln(greatest(coalesce(c.like_count, 0) + coalesce(c.view_count, 0) / 10.0, 1)) / ln(10.0))
        + CASE WHEN c.doctor_id = v_boost_doctor_id THEN 2.0 ELSE 0 END
      )::numeric AS score
    FROM public.cards c
    WHERE c.status = 'published'
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC, s.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

-- 3.3 tag_cards_scored ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tag_cards_scored(text, integer, integer, numeric, numeric);
CREATE OR REPLACE FUNCTION public.tag_cards_scored(
  p_tag text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, title text, body text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer, share_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean,
  shortcode text, pubmed_refs jsonb[],
  score numeric, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.title, c.body, c.meta, c.keywords,
      c.like_count, c.view_count, c.save_count, c.share_count,
      c.doctor_id, c.video_id, c.author_id, c.created_at, c.updated_at,
      c.type::text AS type_text,
      c.post_year, c.post_slug, c.shortcode::text AS shortcode,
      c.external_url, c.external_title, c.external_description,
      c.external_image, c.external_site_name,
      c.category, c.hide_doctor_credential,
      c.pubmed_refs,
      (
        (ln(greatest(coalesce(c.like_count, 0) + coalesce(c.view_count, 0) / 10.0
          + coalesce(c.save_count, 0) * 2.0, 1)) / ln(10.0) + 1.0)
        * exp(- extract(epoch from (now() - c.created_at))
              / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0)))
        * CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric AS score
    FROM public.cards c
    WHERE c.status = 'published'
      AND c.category IN ('qa', 'tip') AND c.doctor_id IS NOT NULL
      AND p_tag = ANY(c.keywords)
  )
  SELECT
    s.id, s.title, s.body, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count, s.share_count,
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
    s.score, s.created_at, s.updated_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

-- 3.4 get_notifications — 반환 alias card_question → card_title ────────────
DROP FUNCTION IF EXISTS public.get_notifications(uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.get_notifications(
  p_active_profile_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(
  id bigint, kind text, card_id bigint, comment_id bigint,
  actor_id uuid, actor_display_name text, actor_avatar_url text, actor_handle text,
  card_title text, url text, read_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active AS (
    SELECT public.validate_active_profile_id(p_active_profile_id) AS id
  )
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.title AS card_title,
    n.url, n.read_at, n.created_at
  FROM public.notifications n
  JOIN active a ON a.id IS NOT NULL AND a.id = n.recipient_id
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
  LEFT JOIN public.doctors d ON d.id = da.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  ORDER BY n.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$function$;

-- 3.5 get_top_cards_by_comments_inner ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible'
     GROUP BY cm.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- 3.6 get_top_cards_by_likes_inner ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT l.card_id, COUNT(DISTINCT l.user_id)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since AND l.user_id IS NOT NULL
     GROUP BY l.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- 3.7 get_top_cards_by_saves_inner ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id, COUNT(DISTINCT s.user_id)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since AND s.user_id IS NOT NULL
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- 3.8 get_top_cards_by_shares_inner ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.user_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND (s.user_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- 3.9 get_top_cards_by_views_inner ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_views_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.user_id::text, v.session_id))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- 3.10 get_top_new_cards_inner ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_new_cards_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_new_cards_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text, author_id uuid,
  author_name text, author_handle text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT c.id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, c.created_at
    FROM public.cards c
    CROSS JOIN bounds b
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.created_at >= b.since
     AND c.status = 'published'
     AND c.deleted_at IS NULL
   ORDER BY c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$function$;

COMMIT;

-- PostgREST 스키마 캐시 reload (RPC 시그니처 변경 반영).
NOTIFY pgrst, 'reload schema';
