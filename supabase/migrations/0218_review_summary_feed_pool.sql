-- 0218: 시술 리포트 피드 주입용 경량 집계 RPC (홈 피드 결정적 주입)
--
-- 배경: 홈 피드가 유기 카드 20장마다 리포트 컴팩트 카드 1장을 주입한다. 이때 카드가 필요한
--   집계(후기수·만족도 avg+분포·통증 avg·재시술 분포) + 앵커 card_id 를 ★단일 쿼리로 한 번에
--   반환(홈 로드마다 시술별 getProcedureReport 25회 직격 방지). 효과·인구통계·다운타임/효과시기
--   분포는 컴팩트(접힘) 카드에서 안 쓰므로 미집계 — 더보기는 /reports/{en} 단독 페이지로 이동.
--
-- 대상: published 앵커(type=review_summary) + 발행 후기 ≥1. anon/authenticated GRANT.
--   앵커가 draft 면 0행 반환(피드에 리포트 카드 미주입) — 공개 플립 전 안전.

CREATE OR REPLACE FUNCTION public.get_review_summary_pool()
RETURNS TABLE(
  anchor_card_id bigint,
  anchor_title   text,
  en             text,
  ko             text,
  category       text,
  like_count     integer,
  save_count     integer,
  share_count    integer,
  review_count   bigint,
  sat_avg        numeric,
  sat_dist       integer[],
  pain_avg       numeric,
  revisit_yes    bigint,
  revisit_maybe  bigint,
  revisit_no     bigint
)
LANGUAGE sql
STABLE
AS $fn$
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
    WHERE pr.procedure_ko = t.ko
      AND rc.type = 'review'::qa_type
      AND rc.status = 'published'
      AND rc.deleted_at IS NULL
  ) agg ON true
  WHERE c.type = 'review_summary'::qa_type
    AND c.status = 'published'
    AND c.deleted_at IS NULL
    AND agg.review_count > 0;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_review_summary_pool() TO anon, authenticated;
