-- 0228: get_review_summary_pool — family 롤업 (작업 D-b)
--
-- live(2026-06-04) 정의 VERBATIM + LATERAL agg 의 procedure_ko 매칭만 family 로 확장.
--   pr.procedure_ko = t.ko  →  = ANY(public.procedure_family(t.ko))
--   부모 앵커(t.ko=부모)는 자기+직속하위 합산, 자식 앵커는 자기만. 나머지 불변.
-- FEED_MIN_REVIEWS(=4, procedure-report.ts)는 이 review_count(=family count) 기준.

CREATE OR REPLACE FUNCTION public.get_review_summary_pool()
 RETURNS TABLE(anchor_card_id bigint, anchor_title text, en text, ko text, category text, like_count integer, save_count integer, share_count integer, review_count bigint, sat_avg numeric, sat_dist integer[], pain_avg numeric, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id, c.title, c.post_slug, t.ko, t.category,
    c.like_count, c.save_count, c.share_count,
    agg.review_count, agg.sat_avg, agg.sat_dist, agg.pain_avg,
    agg.revisit_yes, agg.revisit_maybe, agg.revisit_no
  FROM public.cards c
  JOIN public.procedure_taxonomy t ON t.en = c.post_slug
  JOIN LATERAL (
    SELECT
      count(*) AS review_count,
      avg(pr.satisfaction)::numeric AS sat_avg,
      ARRAY[
        count(*) FILTER (WHERE pr.satisfaction = 1),
        count(*) FILTER (WHERE pr.satisfaction = 2),
        count(*) FILTER (WHERE pr.satisfaction = 3),
        count(*) FILTER (WHERE pr.satisfaction = 4),
        count(*) FILTER (WHERE pr.satisfaction = 5)
      ]::integer[] AS sat_dist,
      avg(pr.pain)::numeric AS pain_avg,
      count(*) FILTER (WHERE pr.revisit = 'yes')   AS revisit_yes,
      count(*) FILTER (WHERE pr.revisit = 'maybe') AS revisit_maybe,
      count(*) FILTER (WHERE pr.revisit = 'no')    AS revisit_no
    FROM public.procedure_reviews pr
    JOIN public.cards rc ON rc.id = pr.card_id
    WHERE pr.procedure_ko = ANY(public.procedure_family(t.ko))
      AND rc.type = 'review'::qa_type
      AND rc.status = 'published'
      AND rc.deleted_at IS NULL
  ) agg ON true
  WHERE c.type = 'review_summary'::qa_type
    AND c.status = 'published'
    AND c.deleted_at IS NULL
    AND agg.review_count > 0;
$function$;
