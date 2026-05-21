-- 0144: 방문자 정의를 "1일 1방문" 으로 통일 (2026-05-21)
--
-- 사용자 결정 — "한 사람이 하루에 여러 번 들러도 1방문. 다음날 들르면 +1방문."
-- 네이버 카페 식. SNS 표준 중 가장 직관적 지표.
--
-- 옛 정책 (0142): 방문자 = session_id 단위 distinct. 한 사람이 하루에 탭 5번 여닫으면
-- 5 visits. 활발한 사용자 과대평가 + "방문자 수" 직관과 어긋남.
--
-- 새 정책:
--   방문자 unit = (로그인은 user_id / 비로그인은 session_id) × KST 날짜
--   같은 사람 하루 여러 번 = 1. 다음날 = +1. 비로그인도 동일 (session_id × DATE).
--   KST 기준 — 한국 사용자 자정이 의미 있도록.
--
-- 영향 RPC:
--   - get_admin_kpi_inner (대시보드 visitors)
--   - get_users_kpi_inner (회원관리 visit_sessions)
--   - get_top_visitors_inner (방문자 TOP)
--   - get_top_cards_by_views_inner (조회 TOP — 한 사람이 같은 카드 다른 날 조회 시 +1)

BEGIN;

-- ── (A) get_admin_kpi_inner — 1일 1방문 ──
CREATE OR REPLACE FUNCTION public.get_admin_kpi_inner(p_days integer DEFAULT 7)
RETURNS TABLE(
  visitors bigint, views bigint, comments bigint,
  likes bigint, saves bigint, shares bigint
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
    -- impression + view 합산. (방문자 정의 = 흔적 남긴 사람)
    SELECT user_id, session_id, created_at
      FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT user_id, session_id, created_at
      FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
  )
  SELECT
    -- 방문자 = (user|session) × KST 날짜 distinct. 1일 1방문.
    (SELECT count(DISTINCT (
       COALESCE(e.user_id::text, e.session_id),
       (e.created_at AT TIME ZONE 'Asia/Seoul')::date
     ))::bigint
       FROM events e
      WHERE e.user_id IS NOT NULL OR e.session_id IS NOT NULL) AS visitors,
    -- 조회수 = (user|session) × KST 날짜 distinct. 같은 카드 같은 사람 하루 1회.
    (SELECT count(DISTINCT (
       COALESCE(v.user_id::text, v.session_id),
       (v.created_at AT TIME ZONE 'Asia/Seoul')::date
     ))::bigint
       FROM public.card_views v, bounds b
      WHERE v.created_at >= b.since
        AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)) AS views,
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since AND c.status = 'visible') AS comments,
    (SELECT count(*)::bigint
       FROM public.card_likes l, bounds b
      WHERE l.created_at >= b.since) AS likes,
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since) AS saves,
    (SELECT count(*)::bigint
       FROM public.card_shares sh, bounds b
      WHERE sh.created_at >= b.since) AS shares;
$$;

-- ── (B) get_users_kpi_inner — visit_sessions 를 "방문 일수" 로 ──
CREATE OR REPLACE FUNCTION public.get_users_kpi_inner(p_days integer DEFAULT 7)
RETURNS TABLE(
  profile_id uuid,
  visit_sessions bigint,
  views_received bigint,
  comments_written bigint,
  likes_received bigint,
  shares_received bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  vs AS (
    -- 회원별 방문 일수 (KST 날짜 distinct). 같은 날 여러 번 들러도 1.
    SELECT e.user_id AS pid,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS d
      FROM (
        SELECT user_id, created_at FROM public.card_impressions
         WHERE created_at >= (SELECT since FROM bounds) AND user_id IS NOT NULL
         UNION ALL
        SELECT user_id, created_at FROM public.card_views
         WHERE created_at >= (SELECT since FROM bounds) AND user_id IS NOT NULL
      ) e
     GROUP BY e.user_id
  ),
  vw AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_views v JOIN public.cards c ON c.id = v.card_id, bounds b
     WHERE v.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  cw AS (
    SELECT cm.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible' AND cm.author_id IS NOT NULL
     GROUP BY cm.author_id
  ),
  lk AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_likes l JOIN public.cards c ON c.id = l.card_id, bounds b
     WHERE l.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  sh AS (
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM public.card_shares s JOIN public.cards c ON c.id = s.card_id, bounds b
     WHERE s.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  pids AS (
    SELECT pid FROM vs
    UNION SELECT pid FROM vw
    UNION SELECT pid FROM cw
    UNION SELECT pid FROM lk
    UNION SELECT pid FROM sh
  )
  SELECT
    p.pid AS profile_id,
    COALESCE(vs.d, 0)::bigint AS visit_sessions,
    COALESCE(vw.c, 0)::bigint AS views_received,
    COALESCE(cw.c, 0)::bigint AS comments_written,
    COALESCE(lk.c, 0)::bigint AS likes_received,
    COALESCE(sh.c, 0)::bigint AS shares_received
  FROM pids p
  LEFT JOIN vs ON vs.pid = p.pid
  LEFT JOIN vw ON vw.pid = p.pid
  LEFT JOIN cw ON cw.pid = p.pid
  LEFT JOIN lk ON lk.pid = p.pid
  LEFT JOIN sh ON sh.pid = p.pid;
$$;

-- ── (C) get_top_visitors_inner — 방문 일수 단위 ──
DROP FUNCTION IF EXISTS public.get_top_visitors_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_visitors_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  handle text,
  visit_count bigint
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
  logged_in AS (
    -- 로그인 사용자: 방문 일수 (KST 날짜 distinct)
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS visit_count
      FROM events e
      JOIN public.profiles p ON p.id = e.user_id
     WHERE e.user_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  anon AS (
    -- 비로그인: (session_id × KST 날짜) distinct 합산. 한 행("비로그인 방문자").
    SELECT NULL::uuid AS profile_id,
           '비로그인 방문자'::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date))::bigint AS visit_count
      FROM events e
     WHERE e.user_id IS NULL AND e.session_id IS NOT NULL
     HAVING COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date)) > 0
  )
  SELECT * FROM logged_in
  UNION ALL
  SELECT * FROM anon
  ORDER BY visit_count DESC, display_name
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors_inner(integer, integer, integer) TO authenticated;

-- ── (D) get_top_cards_by_views_inner — 카드별 (visitor × 날짜) distinct ──
DROP FUNCTION IF EXISTS public.get_top_cards_by_views_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views_inner(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    -- 같은 visitor 가 같은 카드 같은 날 여러 번 봐도 1. 다른 날 다시 보면 +1.
    SELECT v.card_id,
           COUNT(DISTINCT (
             COALESCE(v.user_id::text, v.session_id),
             (v.created_at AT TIME ZONE 'Asia/Seoul')::date
           ))::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
       AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)
     GROUP BY v.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views_inner(integer, integer, integer) TO authenticated;

COMMIT;
