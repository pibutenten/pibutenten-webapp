-- 0170_feed_rpcs_add_pubmed_refs.sql
--
-- 회귀 fix (2026-05-27):
--   Critical-6 의 stripLegacyReferencesTail 가 옛 카드 본문의 평문 "참고문헌\n1. ..."
--   꼬리를 렌더 시점에 잘라내자, 홈 피드/태그 페이지에서 참고문헌이 완전히 사라짐.
--   원인: feed_cards_scored / tag_cards_scored RPC 가 pubmed_refs 컬럼을 반환하지 않음
--   → CardBody 의 별도 ref 섹션도 빈 상태로 렌더 → 옛 평문 꼬리가 유일한 표시 수단이었는데
--   그것마저 정리되니 ref 완전 부재.
--
--   해결: 두 RPC 의 RETURNS TABLE 에 pubmed_refs jsonb[] 추가 + SELECT 본문에서
--   c.pubmed_refs 그대로 반환. search_cards_scored 는 이미 포함되어 있음 (회귀 없음).
--
-- 캐스케이드:
--   RETURNS TABLE 컬럼 추가는 in-place ALTER 불가 → DROP + CREATE OR REPLACE.
--   호출 측 (src/app/page.tsx, src/app/topics/[tag]/page.tsx) 은 `as CardData[]` 로
--   컬럼 이름 기반 접근하므로 컬럼 위치 변경 회귀 없음.

-- ─────────────────────────────────────────────────────────────
-- 1) feed_cards_scored — 홈 피드
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric) CASCADE;

CREATE OR REPLACE FUNCTION public.feed_cards_scored(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, question text, answer text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text, status text,
  post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean,
  shortcode text,
  pubmed_refs jsonb[],
  score numeric,
  created_at timestamp with time zone
)
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

GRANT EXECUTE ON FUNCTION public.feed_cards_scored(integer, integer, numeric, numeric) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) tag_cards_scored — 태그/토픽 페이지
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.tag_cards_scored(text, integer, integer, numeric, numeric) CASCADE;

CREATE OR REPLACE FUNCTION public.tag_cards_scored(
  p_tag text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2
)
RETURNS TABLE(
  id bigint, question text, answer text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer, share_count integer,
  doctor jsonb, video jsonb, author jsonb,
  type text,
  post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean,
  shortcode text,
  pubmed_refs jsonb[],
  score numeric,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id, c.question, c.answer, c.meta, c.keywords,
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
    s.id, s.question, s.answer, s.meta, s.keywords,
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

GRANT EXECUTE ON FUNCTION public.tag_cards_scored(text, integer, integer, numeric, numeric) TO anon, authenticated;

SELECT 'OK 0170' AS status;
