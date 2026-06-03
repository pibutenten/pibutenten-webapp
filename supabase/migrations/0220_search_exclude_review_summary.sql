-- 0220: search_cards_scored 에서 시술 리포트 앵커(review_summary) 제외
--
-- 배경: 홈 무한스크롤(/api/cards, q='')과 /search 결과 목록이 모두 search_cards_scored 를 통해
--   카드를 가져온다(fetchCardList). 0217 은 feed_cards_scored(홈 SSR 초기)만 고쳐, search RPC 가
--   여전히 published 앵커를 일반 카드로 반환 → 스크롤 시 "피부텐텐 리포트 | {ko}" 일반 카드 누출.
--   → search_cards_scored WHERE 에 review_summary 제외 추가(라이브 VERBATIM + 한 줄). 앵커의
--   피드 노출은 Feed 결정적 주입(컴팩트 카드)이 전담, 검색 최상단 리포트 카드는 getProcedureReport.
-- CREATE OR REPLACE(시그니처·ACL·STABLE 보존). feed/tag RPC 미변경.

BEGIN;

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
      AND c.type <> 'review_summary'::qa_type
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
$function$
;

COMMIT;
