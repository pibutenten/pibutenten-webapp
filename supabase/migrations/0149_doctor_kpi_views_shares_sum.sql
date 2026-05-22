-- 0149: get_doctor_kpi_inner.views/shares 정의 통일 (2026-05-22)
--
-- 사용자 보고: 배정민 대시보드 조회수=4 인데 TOP 페이지 각 글 합산=7. 정의 불일치.
--
-- 옛 정의 (불일치):
--   views_received = COUNT DISTINCT (visitor × KST 날짜)
--     → 한 visitor 가 같은 날 본인 글 여러 개 봐도 1
--     → 카드별 unique visitor 합과 다름
--   shares_received = row count
--     → TOP per-card = COUNT DISTINCT visitor 와 다름
--
-- 새 정의 (사용자 상식 = 각 글 조회수 합):
--   views_received  = SUM over (per-card COUNT DISTINCT visitor)
--   shares_received = SUM over (per-card COUNT DISTINCT visitor)
--     → 대시보드 KPI = TOP 페이지 합 (항상 일치)
--     → 카드별 카운트가 신뢰 가능한 단위
--
-- comments_received 와 saves_received 는 이미 TOP 과 일관:
--   comments: row count (TOP 도 row count) ✓
--   saves: row count (PK=(card_id,user_id) 라 SUM(distinct user) 와 동일) ✓

BEGIN;

CREATE OR REPLACE FUNCTION public.get_doctor_kpi_inner(
  p_doctor_id uuid,
  p_profile_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(
  views_received bigint,
  comments_received bigint,
  saves_received bigint,
  shares_received bigint,
  published_total bigint,
  pending_review bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  -- 본인 카드 id 집합 (author_id OR doctor_id 매칭, deleted_at 제외)
  my_cards AS (
    SELECT id
      FROM public.cards
     WHERE (author_id = p_profile_id OR doctor_id = p_doctor_id)
       AND deleted_at IS NULL
  ),
  -- 1. views per-card (TOP 페이지와 동일 정의)
  views_per_card AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.user_id::text, v.session_id))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND v.card_id IN (SELECT id FROM my_cards)
       AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  ),
  -- 4. shares per-card (TOP 페이지와 동일 정의)
  shares_per_card AS (
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.user_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND s.card_id IN (SELECT id FROM my_cards)
       AND (s.user_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  SELECT
    -- 1. views_received = SUM(per-card distinct visitor) — 사용자 상식: 각 글 조회수의 합
    COALESCE((SELECT SUM(c) FROM views_per_card), 0)::bigint AS views_received,
    -- 2. comments_received = row count (TOP 과 일관)
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since
        AND c.status = 'visible'
        AND c.card_id IN (SELECT id FROM my_cards)) AS comments_received,
    -- 3. saves_received = row count (PK=(card_id,user_id) 라 SUM(distinct) 과 동일)
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since
        AND s.card_id IN (SELECT id FROM my_cards)) AS saves_received,
    -- 4. shares_received = SUM(per-card distinct visitor) — TOP 과 일관
    COALESCE((SELECT SUM(c) FROM shares_per_card), 0)::bigint AS shares_received,
    -- 5. published_total — 시간 윈도우 무관
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'published'
        AND c.deleted_at IS NULL) AS published_total,
    -- 6. pending_review — 시간 윈도우 무관
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'pending_review'
        AND c.deleted_at IS NULL) AS pending_review;
$$;

COMMIT;
