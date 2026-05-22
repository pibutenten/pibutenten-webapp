-- 0150: get_admin_kpi_inner.views/shares 정의 통일 (2026-05-22)
--
-- 0149 와 동일 정책 — 관리자 대시보드도 KPI = TOP 합 보장.
--
-- 옛 정의 (불일치):
--   views = COUNT DISTINCT (visitor × KST 날짜) — 한 visitor 가 같은 날 여러 카드 봐도 1
--   shares = COUNT *                            — row count
--
-- 새 정의 (사용자 상식 = 각 글 조회수의 합):
--   views = SUM over (per-card COUNT DISTINCT visitor)
--   shares = SUM over (per-card COUNT DISTINCT visitor)
--   → KPI = TOP 페이지 합 (항상 일치)
--
-- 그대로 유지:
--   visitors  — 사이트 방문자(distinct visitor × KST date), 카드별 합과 별개 의미
--   comments  — row count (TOP 도 row count) ✓
--   likes/saves — row count (PK=(card_id,user_id) 라 SUM(distinct user) 와 동일) ✓
--   new_members / new_cards — row count ✓

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_kpi_inner(p_days integer DEFAULT 7)
RETURNS TABLE(
  visitors bigint,
  new_members bigint,
  views bigint,
  new_cards bigint,
  comments bigint,
  likes bigint,
  saves bigint,
  shares bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  events AS (
    SELECT user_id, session_id, created_at FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT user_id, session_id, created_at FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
  ),
  -- views per-card (TOP 페이지와 동일 정의) — deleted 카드 제외, distinct visitor
  views_per_card AS (
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.user_id::text, v.session_id))::bigint AS c
      FROM public.card_views v
      JOIN public.cards c ON c.id = v.card_id
     WHERE v.created_at >= (SELECT since FROM bounds)
       AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)
       AND c.deleted_at IS NULL
     GROUP BY v.card_id
  ),
  -- shares per-card (TOP 페이지와 동일 정의)
  shares_per_card AS (
    SELECT sh.card_id,
           COUNT(DISTINCT COALESCE(sh.user_id::text, sh.session_id))::bigint AS c
      FROM public.card_shares sh
      JOIN public.cards c ON c.id = sh.card_id
     WHERE sh.created_at >= (SELECT since FROM bounds)
       AND (sh.user_id IS NOT NULL OR sh.session_id IS NOT NULL)
       AND c.deleted_at IS NULL
     GROUP BY sh.card_id
  )
  SELECT
    -- 방문자: 사이트 방문자 (visitor × KST 날짜 distinct) — 카드별 합과 별개 의미 그대로
    (SELECT count(DISTINCT (
       COALESCE(e.user_id::text, e.session_id),
       (e.created_at AT TIME ZONE 'Asia/Seoul')::date
     ))::bigint
       FROM events e
      WHERE e.user_id IS NOT NULL OR e.session_id IS NOT NULL) AS visitors,
    (SELECT count(*)::bigint
       FROM public.profiles pr, bounds b
      WHERE pr.created_at >= b.since
        AND pr.deleted_at IS NULL) AS new_members,
    -- views = SUM(per-card distinct visitor) — KPI = TOP 합 보장
    COALESCE((SELECT SUM(c) FROM views_per_card), 0)::bigint AS views,
    (SELECT count(*)::bigint
       FROM public.cards cd, bounds b
      WHERE cd.created_at >= b.since
        AND cd.status = 'published'
        AND cd.deleted_at IS NULL) AS new_cards,
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since AND c.status = 'visible') AS comments,
    (SELECT count(*)::bigint
       FROM public.card_likes l, bounds b
      WHERE l.created_at >= b.since) AS likes,
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since) AS saves,
    -- shares = SUM(per-card distinct visitor) — KPI = TOP 합 보장
    COALESCE((SELECT SUM(c) FROM shares_per_card), 0)::bigint AS shares;
$$;

COMMIT;
