-- 0326: feed_cards_scored 에 p_category 선택 파라미터 추가 — 피드 카테고리 탭 서버측 풀
--
-- 배경: 홈 피드는 "상위 300개 점수순 풀 1개"를 받아 카테고리 탭(Q&A/시술후기/끄적끄적)을
--   클라이언트에서 필터하는 구조였다. 2026-06 시술후기(review) 750건 유입 후 최근성 점수
--   (반감기 14일)로 상위 300 풀이 review 로 도배(실측 2026-07-03: review 290 / doodle 6 / qa 4)
--   → Q&A 1,011건이 있어도 탭에는 4개만 보이고 무한스크롤도 더 줄 것이 없는 상태.
-- 조치: 점수 공식·컬럼·필터 불변식(published + deleted_at IS NULL + type<>review_summary)은
--   그대로 두고, 선택적 카테고리 필터(p_category)만 추가한다.
--   p_category IS NULL(기본)이면 종전과 100% 동일 — 기존 호출부(홈 전체 풀, feed-sidebar-cached,
--   토픽 keywords 집계)는 인자 미전달로 무영향.
--
-- 시그니처가 바뀌므로 구 4-파라미터 함수를 DROP 후 재생성한다.
--   (CREATE OR REPLACE 는 파라미터 목록이 다르면 "별도 오버로드"를 새로 만들어
--    PostgREST named-args 호출이 모호(ambiguous)해지는 사고 방지.)
-- 원 함수 속성 유지: LANGUAGE plpgsql / SECURITY INVOKER(미지정) / owner postgres / 기본 ACL.

DROP FUNCTION IF EXISTS public.feed_cards_scored(integer, integer, numeric, numeric);

CREATE FUNCTION public.feed_cards_scored(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_half_life_days numeric DEFAULT 14,
  p_jitter_amp numeric DEFAULT 0.2,
  p_category text DEFAULT NULL
)
RETURNS TABLE(
  id bigint, title text, body text, meta text, keywords text[],
  like_count integer, view_count integer, save_count integer,
  doctor jsonb, video jsonb, author jsonb, type text, status text,
  post_year integer, post_slug text,
  external_url text, external_title text, external_description text,
  external_image text, external_site_name text,
  category text, hide_doctor_credential boolean, shortcode text,
  pubmed_refs jsonb[], score numeric,
  created_at timestamp with time zone, reviewed_at timestamp with time zone,
  procedure_review jsonb
)
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
      AND c.type <> 'review_summary'::qa_type
      AND (p_category IS NULL OR c.category = p_category)
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

-- 명시적 EXECUTE 부여 — 원 함수는 proacl=NULL(supabase_admin 기본 ACL 의존)이었으나,
--   재생성 함수는 owner=postgres 라 기본 ACL 적용이 환경 내부 동작에 걸려 있음(디비전문가 검수 경고).
--   anon(홈 풀·사이드바 쿠키리스 조회)·authenticated·service_role 에 명시 부여해 의존 제거.
GRANT EXECUTE ON FUNCTION public.feed_cards_scored(integer, integer, numeric, numeric, text)
  TO anon, authenticated, service_role;

-- PostgREST 스키마 캐시 즉시 갱신 — 신규 시그니처(named-args 5개)를 API 가 바로 인식하도록.
NOTIFY pgrst, 'reload schema';
