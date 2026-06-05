-- 0238_get_review_report_overview.sql
-- 2026-06-05 — 운영자 '시술 리포트' 대시보드 전용 집계 RPC (읽기 전용).
--
-- 배경:
--   기존 get_review_summary_pool()(0218/0228)은 홈 피드 주입용(anon/authenticated GRANT)이라
--   admin 전용이 아니고, engagement 중 view_count 를 반환하지 않는다(like/save/share 만).
--   운영자 대시보드 표는 조회/저장/공유 + 후기수·재시술의향·만족도·통증을 시술별로 보여야 한다.
--
-- 설계:
--   - get_review_summary_pool 의 집계 로직(procedure_family 롤업) 재사용 + view_count 추가.
--   - admin 전용: SECURITY DEFINER + is_admin(auth.uid()) 가드. GRANT authenticated (비-admin 은 본문 가드로 차단).
--   - 카테고리/정렬은 procedure_taxonomy(category, sort_order) 동적 — 카테고리 늘어도 자동 반영.
--   - 데이터 변경 없음(SELECT only). get_review_summary_pool 미수정.
--
-- 반환: 시술별 1행. en(=post_slug, /reports/{en} 링크), ko, category, sort_order,
--        review_count, revisit_yes/maybe/no, sat_avg, pain_avg, view_count, save_count, share_count.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_review_report_overview()
RETURNS TABLE(
  en text,
  ko text,
  category text,
  sort_order integer,
  review_count bigint,
  revisit_yes bigint,
  revisit_maybe bigint,
  revisit_no bigint,
  sat_avg numeric,
  pain_avg numeric,
  view_count integer,
  save_count integer,
  share_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- admin 전용 가드 (defense-in-depth; 페이지단 requireAdminPage 와 별개).
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.post_slug,
    t.ko,
    t.category,
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
  JOIN public.procedure_taxonomy t ON t.en = c.post_slug
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

REVOKE ALL ON FUNCTION public.get_review_report_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_report_overview() TO authenticated;

COMMIT;

SELECT 'OK 0238' AS status;
