-- 0314. 시술 리포트 RPC 카테고리 매핑 확장 (10종 체계)
--
-- get_review_report_overview, get_review_summary_pool 의 CASE WHEN 을
-- 기존 2분기(lifting/injectables/knowledge) → 6분기(lifting/skinbooster/filler/contour/laser/other) 로 확장.
-- 기존 '스킨부스터'→'injectables' 를 '스킨부스터'→'skinbooster' 로 변경.
-- 새 카테고리: 필러·볼륨→filler, 주름·윤곽→contour, 레이저→laser, 기타→other.
-- 비시술 카테고리(피부고민/홈케어/피부상식/미지정)는 ELSE→'other' 로 fallback(리포트에 나올 일 없음).

-- 1) get_review_report_overview (admin)
CREATE OR REPLACE FUNCTION public.get_review_report_overview()
 RETURNS TABLE(en text, ko text, category text, sort_order integer, review_count bigint, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint, sat_avg numeric, pain_avg numeric, view_count integer, save_count integer, share_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.post_slug,
    t.ko,
    (CASE t.category
       WHEN '리프팅'     THEN 'lifting'
       WHEN '스킨부스터' THEN 'skinbooster'
       WHEN '필러·볼륨'  THEN 'filler'
       WHEN '주름·윤곽'  THEN 'contour'
       WHEN '레이저'     THEN 'laser'
       WHEN '기타'       THEN 'other'
       ELSE 'other'
     END),
    t.sort_order,
    agg.review_count,
    agg.revisit_yes,
    agg.revisit_maybe,
    agg.revisit_no,
    agg.sat_avg,
    agg.pain_avg,
    c.view_count,
    c.save_count,
    c.share_count
  FROM public.cards c
  JOIN public.tag_dictionary t ON t.en = c.post_slug AND t.is_procedure
  JOIN LATERAL (
    SELECT
      count(*) AS review_count,
      avg(pr.satisfaction)::numeric AS sat_avg,
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
    AND agg.review_count > 0
  ORDER BY t.category, t.sort_order, t.ko;
END;
$function$;

-- 2) get_review_summary_pool
CREATE OR REPLACE FUNCTION public.get_review_summary_pool()
 RETURNS TABLE(anchor_card_id bigint, anchor_title text, en text, ko text, category text, like_count integer, save_count integer, share_count integer, review_count bigint, sat_avg numeric, sat_dist integer[], pain_avg numeric, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id, c.title, c.post_slug, t.ko,
    (CASE t.category
       WHEN '리프팅'     THEN 'lifting'
       WHEN '스킨부스터' THEN 'skinbooster'
       WHEN '필러·볼륨'  THEN 'filler'
       WHEN '주름·윤곽'  THEN 'contour'
       WHEN '레이저'     THEN 'laser'
       WHEN '기타'       THEN 'other'
       ELSE 'other'
     END),
    c.like_count, c.save_count, c.share_count,
    agg.review_count, agg.sat_avg, agg.sat_dist, agg.pain_avg,
    agg.revisit_yes, agg.revisit_maybe, agg.revisit_no
  FROM public.cards c
  JOIN public.tag_dictionary t ON t.en = c.post_slug AND t.is_procedure
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
