-- 0215: feed_cards_scored 의 '의사글 ×2' 가중에 시술 리포트 앵커(review_summary) 포함 (C 앵커 3단계 / C3)
--
-- 배경: 시술 리포트 앵커(type=review_summary)를 의사 Q&A 와 동등하게 ×2 가중해 피드에서
--   상위 노출시킨다. C1 에서 앵커는 'draft' 로 생성됐으므로, 본 변경은 앵커가 published 로
--   플립되기 전까지는 실질 효과 없음(feed_cards_scored WHERE status='published' 가 draft 제외).
--
-- 변경 범위: feed_cards_scored 단 하나. 점수식의 ×2 CASE 한 줄만 수정:
--   CASE WHEN c.doctor_id IS NOT NULL THEN 2.0 ELSE 1.0 END
--   → CASE WHEN c.doctor_id IS NOT NULL OR c.type = 'review_summary'::qa_type THEN 2.0 ELSE 1.0 END
--   나머지 본문(WHERE status='published'·deleted_at·정렬·LEFT JOIN·procedure_review 임베드 등)은
--   0206 정의를 한 글자도 바꾸지 않고 그대로 재현(라이브 production 정의와 동일 확인).
-- ★search_cards_scored·tag_cards_scored 는 건드리지 않음(피드만).
-- 시그니처 동일 → CREATE OR REPLACE (ACL 보존, 0206 도 별도 GRANT 없이 기본 EXECUTE).

BEGIN;

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
        * CASE WHEN c.doctor_id IS NOT NULL OR c.type = 'review_summary'::qa_type THEN 2.0 ELSE 1.0 END
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

COMMIT;
