-- 0068: TOP/KPI RPC 들 cards/card_* 직접 참조로 재정의
--
-- 0065 에서 comments.qa_id → comments.card_id 로 컬럼 rename. RPC 본문이 옛 컬럼명 참조 → 0건 반환.
-- compat view 만으로는 컬럼 alias 가 함수 본문 안에 안 먹힘 → base table 직접 사용.

CREATE OR REPLACE FUNCTION public.get_top_qas_by_views(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(qa_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT v.card_id, COUNT(*)::bigint AS c
      FROM public.card_views v, bounds b
     WHERE v.created_at >= b.since
     GROUP BY v.card_id
  )
  SELECT c.id AS qa_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a
    JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_top_qas_by_comments(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(qa_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible'
     GROUP BY cm.card_id
  )
  SELECT c.id AS qa_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a
    JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_top_qas_by_likes(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(qa_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT l.card_id, COUNT(*)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since
     GROUP BY l.card_id
  )
  SELECT c.id AS qa_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a
    JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_top_qas_by_saves(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(qa_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT s.card_id, COUNT(*)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since
     GROUP BY s.card_id
  )
  SELECT c.id AS qa_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a
    JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_top_qas_by_shares(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(qa_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT sh.card_id, COUNT(*)::bigint AS c
      FROM public.card_shares sh, bounds b
     WHERE sh.created_at >= b.since
     GROUP BY sh.card_id
  )
  SELECT c.id AS qa_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a
    JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

-- get_top_visitors / get_admin_kpi: 0061 에서 이미 cards/card_* 직접 참조로 정의됨 → skip

SELECT 'OK 0068' AS status;
