-- 0154: feed_cards_scored RPC 반환에 status 컬럼 추가 (2026-05-22)
--
-- 배경:
--   admin 이 카드 ⋮ 메뉴에서 '숨김' 토글하려는데 메뉴에 항목이 안 뜨는 회귀.
--   Card.tsx 는 card.status 로 hidden/published 분기하는데, 메인 피드는
--   feed_cards_scored RPC 사용. 그런데 RPC 반환 시그니처에 status 컬럼이 없어
--   card.status === undefined 상태로 client 로 전달됨.
--
--   admin 메인 피드에서도 RLS 가 published 만 통과시키므로 사실상 모든 카드는
--   published 이지만, 정확한 라벨링과 향후 hidden 카드 노출 시 대비 위해 RPC
--   반환에 status 컬럼 추가.
--
-- 변경:
--   feed_cards_scored 의 RETURNS TABLE 에 `status text` 추가.
--   본문에서 c.status::text 를 select 에 포함.
--
-- 호환:
--   RETURNS 시그니처가 바뀌므로 DROP 후 재생성 필요.
--   기존 호출 시그니처 (parameters) 는 동일 — caller 코드 변경 불필요.

DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric);

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
  category text, hide_doctor_credential boolean, shortcode text,
  pubmed_ref jsonb, score numeric, created_at timestamp with time zone
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
    s.category, s.hide_doctor_credential, s.shortcode, s.pubmed_ref,
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;
