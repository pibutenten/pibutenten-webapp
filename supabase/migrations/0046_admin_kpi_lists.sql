-- 0046: 관리자 KPI 리스트용 RPC 7종
-- 정책:
--   - p_days = 0 → 전체 기간
--   - p_days = 1 → 24시간, 7/30/90/365 → 그 일수
--   - SECURITY DEFINER + search_path 고정 (기존 패턴 동일)

-- ─────────────────────────────────────────────────────────────
-- 1. 회원별 KPI 묶음 (B4: /admin/users 테이블)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_users_kpi(p_days integer DEFAULT 7)
RETURNS TABLE (
  profile_id uuid,
  visit_days bigint,    -- 그 회원의 사이트 방문 일수 (qa_views distinct date)
  views_received bigint,-- 그 회원이 작성한 글의 총 조회수
  comments_written bigint, -- 그 회원이 작성한 댓글 수
  likes_received bigint, -- 그 회원의 글들이 받은 좋아요 수
  shares_received bigint -- 그 회원의 글들이 받은 공유 수
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  vd AS ( -- 회원별 방문 일수
    SELECT v.user_id AS pid, COUNT(DISTINCT v.created_at::date)::bigint AS d
    FROM qa_views v, bounds b
    WHERE v.created_at >= b.since AND v.user_id IS NOT NULL
    GROUP BY v.user_id
  ),
  vw AS ( -- 회원 글의 조회수
    SELECT q.author_id AS pid, COUNT(*)::bigint AS c
    FROM qa_views v JOIN qas q ON q.id = v.qa_id, bounds b
    WHERE v.created_at >= b.since AND q.author_id IS NOT NULL
    GROUP BY q.author_id
  ),
  cw AS ( -- 회원이 작성한 댓글
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
    FROM comments c, bounds b
    WHERE c.created_at >= b.since AND c.status = 'visible' AND c.author_id IS NOT NULL
    GROUP BY c.author_id
  ),
  lk AS ( -- 회원 글의 좋아요
    SELECT q.author_id AS pid, COUNT(*)::bigint AS c
    FROM qa_likes l JOIN qas q ON q.id = l.qa_id, bounds b
    WHERE l.created_at >= b.since AND q.author_id IS NOT NULL
    GROUP BY q.author_id
  ),
  sh AS ( -- 회원 글의 공유
    SELECT q.author_id AS pid, COUNT(*)::bigint AS c
    FROM qa_shares s JOIN qas q ON q.id = s.qa_id, bounds b
    WHERE s.created_at >= b.since AND q.author_id IS NOT NULL
    GROUP BY q.author_id
  )
  SELECT p.id AS profile_id,
         COALESCE(vd.d, 0) AS visit_days,
         COALESCE(vw.c, 0) AS views_received,
         COALESCE(cw.c, 0) AS comments_written,
         COALESCE(lk.c, 0) AS likes_received,
         COALESCE(sh.c, 0) AS shares_received
  FROM profiles p
  LEFT JOIN vd ON vd.pid = p.id
  LEFT JOIN vw ON vw.pid = p.id
  LEFT JOIN cw ON cw.pid = p.id
  LEFT JOIN lk ON lk.pid = p.id
  LEFT JOIN sh ON sh.pid = p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_kpi(integer) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. TOP 방문자 (B6: /admin/stats/visitors)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_visitors(
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT p.id AS profile_id,
         p.display_name,
         p.handle,
         COUNT(*)::bigint AS visit_count
  FROM qa_views v
  JOIN profiles p ON p.id = v.user_id
  , bounds b
  WHERE v.created_at >= b.since AND v.user_id IS NOT NULL
  GROUP BY p.id, p.display_name, p.handle
  ORDER BY visit_count DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_visitors(integer, integer, integer) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 공통 헬퍼 — qa 단위 TOP 리스트 (B6: views/comments/likes/saves/shares)
-- 각 항목별 별도 RPC. 공통 컬럼 (qa_id, question, shortcode, author info, cnt)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_qas_by_views(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  qa_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  cnt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  agg AS (
    SELECT v.qa_id, COUNT(*)::bigint AS c
    FROM qa_views v, bounds b
    WHERE v.created_at >= b.since
    GROUP BY v.qa_id
  )
  SELECT q.id AS qa_id, q.question, q.shortcode,
         q.author_id, p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt
  FROM agg a
  JOIN qas q ON q.id = a.qa_id
  LEFT JOIN profiles p ON p.id = q.author_id
  ORDER BY a.c DESC, q.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_qas_by_views(integer, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_top_qas_by_comments(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  qa_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  cnt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  agg AS (
    SELECT c.qa_id, COUNT(*)::bigint AS c
    FROM comments c, bounds b
    WHERE c.created_at >= b.since AND c.status = 'visible'
    GROUP BY c.qa_id
  )
  SELECT q.id AS qa_id, q.question, q.shortcode,
         q.author_id, p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt
  FROM agg a
  JOIN qas q ON q.id = a.qa_id
  LEFT JOIN profiles p ON p.id = q.author_id
  ORDER BY a.c DESC, q.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_qas_by_comments(integer, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_top_qas_by_likes(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  qa_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  cnt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  agg AS (
    SELECT l.qa_id, COUNT(*)::bigint AS c
    FROM qa_likes l, bounds b
    WHERE l.created_at >= b.since
    GROUP BY l.qa_id
  )
  SELECT q.id AS qa_id, q.question, q.shortcode,
         q.author_id, p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt
  FROM agg a
  JOIN qas q ON q.id = a.qa_id
  LEFT JOIN profiles p ON p.id = q.author_id
  ORDER BY a.c DESC, q.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_qas_by_likes(integer, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_top_qas_by_saves(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  qa_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  cnt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  agg AS (
    SELECT s.qa_id, COUNT(*)::bigint AS c
    FROM qa_saves s, bounds b
    WHERE s.created_at >= b.since
    GROUP BY s.qa_id
  )
  SELECT q.id AS qa_id, q.question, q.shortcode,
         q.author_id, p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt
  FROM agg a
  JOIN qas q ON q.id = a.qa_id
  LEFT JOIN profiles p ON p.id = q.author_id
  ORDER BY a.c DESC, q.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_qas_by_saves(integer, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_top_qas_by_shares(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  qa_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  cnt bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  agg AS (
    SELECT sh.qa_id, COUNT(*)::bigint AS c
    FROM qa_shares sh, bounds b
    WHERE sh.created_at >= b.since
    GROUP BY sh.qa_id
  )
  SELECT q.id AS qa_id, q.question, q.shortcode,
         q.author_id, p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt
  FROM agg a
  JOIN qas q ON q.id = a.qa_id
  LEFT JOIN profiles p ON p.id = q.author_id
  ORDER BY a.c DESC, q.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_qas_by_shares(integer, integer, integer) TO authenticated;
