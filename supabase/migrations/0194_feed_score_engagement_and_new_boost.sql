-- 0194: 피드 점수 공식 교체 — 참여 가중치 확대 + "New 부스트"(신규 글 단기 최상단)
--
-- 변경 (feed_cards_scored = 홈 첫 페이지, search_cards_scored = 검색/홈 스크롤):
--   1) 인기 점수 원점수에 공유·댓글 추가. 가중치:
--        저장 ×2, 공유 ×2, 댓글 ×2, 좋아요 ×1, 조회 ×0.1(=/10)
--      - 공유: 기존 cards.share_count 컬럼 사용.
--      - 댓글: 새 컬럼/트리거 없이 comments 테이블에서 status='visible' 만 즉시 count (LEFT JOIN).
--   2) New 부스트(가산): 1.5 * 0.5^(글 나이[시간]) 를 점수에 더함.
--        → 갓 올라온 글 +1.5 (현재 1등 ~1.7 위) → 약 1시간이면 인기글과 교차 → ~6시간이면 ≈0(묻힘).
--        → 반응(좋아요/저장/댓글/공유)이 붙으면 인기 점수가 올라 부스트가 식어도 계속 상위 유지.
--        시간 기준은 created_at (별도 published_at 컬럼 미도입).
--   recency 반감기(14일)·의사 글 ×2·jitter 는 기존 유지.
--
-- 컬럼/트리거 추가 없음 — 함수 본문만 교체.

CREATE OR REPLACE FUNCTION public.feed_cards_scored(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2
)
 RETURNS TABLE(id bigint, title text, body text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, status text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, pubmed_refs jsonb[], score numeric, created_at timestamp with time zone)
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
          coalesce(c.like_count, 0)
          + coalesce(c.view_count, 0) / 10.0
          + coalesce(c.save_count, 0) * 2.0
          + coalesce(c.share_count, 0) * 2.0
          + coalesce(cmt.cc, 0) * 2.0
        , 1)) / ln(10.0) + 1.0)
        * exp(- extract(epoch from (now() - c.created_at))
              / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0)))
        * CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric
      + (1.5 * power(0.5, extract(epoch from (now() - c.created_at)) / 3600.0))::numeric
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_cards_scored(
  p_q text DEFAULT ''::text,
  p_doctor_slug text DEFAULT NULL::text,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20,
  p_boost_doctor_slug text DEFAULT NULL::text
)
 RETURNS TABLE(id bigint, title text, body text, meta text, keywords text[], like_count integer, view_count integer, save_count integer, doctor jsonb, video jsonb, author jsonb, type text, post_year integer, post_slug text, external_url text, external_title text, external_description text, external_image text, external_site_name text, category text, hide_doctor_credential boolean, shortcode text, pubmed_refs jsonb[], score numeric, created_at timestamp with time zone)
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
        + (ln(greatest(
            coalesce(c.like_count, 0)
            + coalesce(c.view_count, 0) / 10.0
            + coalesce(c.save_count, 0) * 2.0
            + coalesce(c.share_count, 0) * 2.0
            + coalesce(cmt.cc, 0) * 2.0
          , 1)) / ln(10.0))
        + CASE WHEN c.doctor_id = v_boost_doctor_id THEN 2.0 ELSE 0 END
        + (1.5 * power(0.5, extract(epoch from (now() - c.created_at)) / 3600.0))
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
    s.score, s.created_at
  FROM scored s
  LEFT JOIN public.doctors d ON d.id = s.doctor_id
  LEFT JOIN public.videos v ON v.id = s.video_id
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC, s.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;
