-- 0172_fix_rpc_deleted_at_and_visitors.sql
--
-- 2026-05-28 — 두 가지 핵심 수정.
--
-- ── 목표 1: 피드/검색/태그 RPC 에 deleted_at IS NULL 다층 방어 ─────────────
-- 현재 0171 의 feed_cards_scored / search_cards_scored / tag_cards_scored 는
-- `WHERE c.status = 'published'` 만 검사하고 deleted_at 필터를 명시하지 않는다.
-- 실제로는 soft_delete_card RPC 가 status 를 hidden 으로 같이 바꾸므로 누출은 없으나,
-- 향후 status 만 published 인 채로 deleted_at 이 설정되는 경로가 새로 생기면
-- 즉시 삭제 카드가 피드/검색/태그 페이지에 노출된다. 명시적 다층 방어로 차단.
--
-- ── 목표 2: get_top_visitors_inner 의 한글 라벨 '비로그인 방문자' 제거 ────
-- 0145 에서 display_name 에 한글 '비로그인 방문자' 를 박았으나, 일부 환경에서
-- 인코딩 깨짐 (Mojibake) 발생. 라벨은 UI 책임으로 옮기고 DB 는 NULL display_name +
-- NULL profile_id 라는 두 가지 신호만 보낸다. StatsListClient 가 profile_id IS NULL
-- 을 보고 "비로그인" 으로 렌더 (한글은 코드 안에서만 다룬다).
--
-- 호환성:
--   - RETURNS TABLE 시그니처는 0145 와 동일 (컬럼 추가/제거 없음). 호출처 영향 없음.
--   - feed/search/tag RPC 도 시그니처 동일.
--
-- 회귀 위험:
--   - feed/search/tag: 현재 status='published' + deleted_at NOT NULL row 가 0건이면
--     결과 동일. 향후 그런 row 가 생겨도 정상적으로 가려지는 방향.
--   - get_top_visitors_inner: display_name 이 NULL 로 와도 UI 가 "비로그인" 으로
--     렌더하므로 기존 사용자 화면은 동일.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── (A) feed_cards_scored — deleted_at IS NULL 추가 ────────────────────────
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
      AND c.deleted_at IS NULL  -- 0172: soft-delete 카드 명시 차단
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

-- ── (B) search_cards_scored — deleted_at IS NULL 추가 ──────────────────────
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
      AND c.deleted_at IS NULL  -- 0172: soft-delete 카드 명시 차단
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

-- ── (C) tag_cards_scored — deleted_at IS NULL 추가 ─────────────────────────
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
      AND c.deleted_at IS NULL  -- 0172: soft-delete 카드 명시 차단
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

-- ── (D) get_top_visitors_inner — display_name NULL (한글 라벨 제거) ───────
-- profile_id IS NULL 행이 곧 비로그인 합계 행. display_name 도 NULL 로 통일하고
-- 라벨링은 UI (StatsListClient) 가 담당한다. 한글 인코딩 사고 (Mojibake) 근본 차단.
DROP FUNCTION IF EXISTS public.get_top_visitors_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_visitors_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  handle text,
  visit_count bigint,
  last_visit_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  events AS (
    SELECT user_id, session_id, created_at FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT user_id, session_id, created_at FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
  ),
  logged_in AS (
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
      JOIN public.profiles p ON p.id = e.user_id
     WHERE e.user_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  anon AS (
    -- 0172: 옛 한글 라벨 '비로그인 방문자' 제거. profile_id IS NULL 이 곧 비로그인 신호.
    -- UI 가 NULL 을 받으면 "비로그인" 으로 표시 (StatsListClient.tsx).
    SELECT NULL::uuid AS profile_id,
           NULL::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date))::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
     WHERE e.user_id IS NULL AND e.session_id IS NOT NULL
     HAVING COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date)) > 0
  )
  SELECT * FROM (
    SELECT * FROM anon
    UNION ALL
    SELECT * FROM logged_in
  ) all_rows
  -- 비로그인 행은 profile_id IS NULL → ORDER BY (profile_id IS NOT NULL) ASC 로 anon 우선
  ORDER BY (profile_id IS NOT NULL) ASC,
           visit_count DESC,
           last_visit_at DESC NULLS LAST,
           display_name
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors_inner(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_visitors_inner(integer, integer, integer)
  FROM PUBLIC, anon;

COMMIT;

-- PostgREST 스키마 캐시 reload (RPC 본문 변경 반영).
NOTIFY pgrst, 'reload schema';
