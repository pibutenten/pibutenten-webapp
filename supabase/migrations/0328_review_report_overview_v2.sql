-- 0328_review_report_overview_v2.sql
-- 2026-07-04 — 관리자 '시술 리포트' 전용 표 확장 (원장 확정 2026-07-04):
--   생성일 · 만족도 분포 · 다운타임 분포 · 효과 top3 — get_review_report_overview() 에 4필드 추가.
--
-- 배경:
--   admin 시술 리포트 표가 시술별 앵커 카드 생성일 + 만족도/다운타임 분포 + 효과 상위 3개까지
--   보여야 한다. 기존 함수(0238 신설 → 0258 tag_dictionary 전환 → 0314 카테고리 6분기)는
--   평균·재시술의향 집계만 반환하므로 RETURNS TABLE 을 확장한다.
--   기존 본문(0314 판 — production pg_get_functiondef 실측과 verbatim 일치)의
--   필드·순서·is_admin 가드·tag_dictionary(en=post_slug) 조인·LATERAL procedure_family 롤업·
--   ORDER BY category,sort_order,ko 는 전부 불변. 신규 4필드만 끝에 추가.
--
-- 신규 필드 계약 (이름·타입·순서 고정 — TS 소비측과 공용 계약):
--   - anchor_created_at timestamptz : 앵커(review_summary) 카드의 cards.created_at
--   - sat_dist integer[]            : 만족도 분포 [5점,4점,3점,2점,1점] 순 5칸 (응답 없으면 0들).
--                                     ⚠ get_review_summary_pool 의 sat_dist 는 [1점..5점] 오름차순 —
--                                     본 함수와 순서가 다르므로 혼용 금지.
--   - downtime_dist integer[]       : [same_day, days_1_2, days_3_5, week_1, weeks_2_plus] 순 5칸
--                                     (src/lib/review-options.ts::DOWNTIME_OPTIONS 순서 SSOT, NULL 응답 제외)
--   - effect_top jsonb              : effect_areas unnest 상위 3개 [{"label":"탄력","n":12},...]
--                                     n 내림차순(동률 시 라벨 오름차순). '없음'
--                                     (src/lib/review-options.ts::EFFECT_NONE_LABEL) 제외. 없으면 '[]'.
--
-- DROP 사유: RETURNS TABLE 컬럼 추가는 return type 변경이라 CREATE OR REPLACE 불가 →
--   기존 0-인자 시그니처를 명시 DROP 후 재생성 (오버로드 잔존 방지).
--
-- ACL 재적용 이유: DROP 으로 기존 GRANT 가 소멸하므로 production 실측 ACL(2026-07-04)
--   {postgres=X/postgres, authenticated=X/postgres} 을 재현한다.
--   (public 스키마 함수 default ACL(grantor postgres)={postgres=X/postgres} 실측 —
--    fresh CREATE 에 anon/service_role 자동 GRANT 없음 → REVOKE PUBLIC + GRANT authenticated 로
--    정확히 재현. 비-admin authenticated 는 본문 is_admin 가드가 차단.)
--
-- ⚠ 적용 경로: 한국어 주석·문자열 포함 → Windows 콘솔 curl/PowerShell(CP949) 금지.
--   반드시 UTF-8 경로(node scratchpad/db.mjs <이 파일>)로 적용할 것 (CLAUDE.md §8).

BEGIN;

DROP FUNCTION public.get_review_report_overview();

CREATE OR REPLACE FUNCTION public.get_review_report_overview()
 RETURNS TABLE(en text, ko text, category text, sort_order integer, review_count bigint, revisit_yes bigint, revisit_maybe bigint, revisit_no bigint, sat_avg numeric, pain_avg numeric, view_count integer, save_count integer, share_count integer, anchor_created_at timestamptz, sat_dist integer[], downtime_dist integer[], effect_top jsonb)
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
    c.share_count,
    c.created_at,
    agg.sat_dist,
    agg.downtime_dist,
    eff.effect_top
  FROM public.cards c
  JOIN public.tag_dictionary t ON t.en = c.post_slug AND t.is_procedure
  JOIN LATERAL (
    SELECT
      count(*) AS review_count,
      avg(pr.satisfaction)::numeric AS sat_avg,
      avg(pr.pain)::numeric AS pain_avg,
      count(*) FILTER (WHERE pr.revisit = 'yes')   AS revisit_yes,
      count(*) FILTER (WHERE pr.revisit = 'maybe') AS revisit_maybe,
      count(*) FILTER (WHERE pr.revisit = 'no')    AS revisit_no,
      -- 만족도 분포 [5점,4점,3점,2점,1점] (계약 순서 — summary_pool 과 역순 주의)
      ARRAY[
        count(*) FILTER (WHERE pr.satisfaction = 5),
        count(*) FILTER (WHERE pr.satisfaction = 4),
        count(*) FILTER (WHERE pr.satisfaction = 3),
        count(*) FILTER (WHERE pr.satisfaction = 2),
        count(*) FILTER (WHERE pr.satisfaction = 1)
      ]::integer[] AS sat_dist,
      -- 다운타임 분포 (DOWNTIME_OPTIONS 순서 SSOT, NULL 은 FILTER 에서 자연 제외)
      ARRAY[
        count(*) FILTER (WHERE pr.downtime = 'same_day'),
        count(*) FILTER (WHERE pr.downtime = 'days_1_2'),
        count(*) FILTER (WHERE pr.downtime = 'days_3_5'),
        count(*) FILTER (WHERE pr.downtime = 'week_1'),
        count(*) FILTER (WHERE pr.downtime = 'weeks_2_plus')
      ]::integer[] AS downtime_dist
    FROM public.procedure_reviews pr
    JOIN public.cards rc ON rc.id = pr.card_id
    WHERE pr.procedure_ko = ANY(public.procedure_family(t.ko))
      AND rc.type = 'review'::qa_type
      AND rc.status = 'published'
      AND rc.deleted_at IS NULL
  ) agg ON true
  -- 효과 top3 (effect_areas unnest, '없음'=EFFECT_NONE_LABEL 제외).
  -- 집계 LATERAL 이라 항상 정확히 1행 반환 → JOIN ON true 로 행 손실 없음. 데이터 없으면 '[]'.
  JOIN LATERAL (
    SELECT COALESCE(
             jsonb_agg(jsonb_build_object('label', e.label, 'n', e.n) ORDER BY e.n DESC, e.label),
             '[]'::jsonb
           ) AS effect_top
    FROM (
      SELECT ea.val AS label, count(*) AS n
      FROM public.procedure_reviews pr
      JOIN public.cards rc ON rc.id = pr.card_id
      CROSS JOIN LATERAL unnest(pr.effect_areas) AS ea(val)
      WHERE pr.procedure_ko = ANY(public.procedure_family(t.ko))
        AND rc.type = 'review'::qa_type
        AND rc.status = 'published'
        AND rc.deleted_at IS NULL
        AND ea.val <> '없음'
      GROUP BY ea.val
      ORDER BY count(*) DESC, ea.val
      LIMIT 3
    ) e
  ) eff ON true
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

NOTIFY pgrst, 'reload schema';

SELECT 'OK 0328' AS status;
