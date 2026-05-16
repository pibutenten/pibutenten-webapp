-- 0117: 메트릭 정책 통일 — "비로그인 포함, session 단위 dedup"
--
-- 변경 사유:
--   기존 get_top_visitors 가 WHERE user_id IS NOT NULL 로 비로그인을 통째 제외했고,
--   get_top_cards_by_views / _by_shares 는 raw COUNT(*) 라 같은 세션의 여러 row 가
--   중복 카운트됐다. 사용자 정책 확정:
--     - 방문자  : 비로그인 포함, (user_id IS NOT NULL 이면 user_id, 아니면 session_id) 단위 unique
--     - 조회수  : 위와 동일 (한 세션의 같은 카드 여러 조회는 1)
--     - 공유    : 위와 동일
--     - 노출수  : 별도 (raw row count — 방문 카운트와 분리)
--
-- card_shares 에 session_id 컬럼이 없어서 비로그인 공유는 dedup 불가능 → 컬럼 추가.

BEGIN;

-- ── 1. card_shares.session_id 컬럼 추가 ──
ALTER TABLE public.card_shares
  ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_card_shares_session
  ON public.card_shares (session_id) WHERE session_id IS NOT NULL;

-- ── 2. get_top_visitors 재정의 ──
-- 비로그인 포함. 로그인 사용자는 profile 별 1행, 비로그인 세션은 합쳐서 1행("비로그인 방문자").
DROP FUNCTION IF EXISTS public.get_top_visitors(integer, integer, integer);
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
  ),
  -- 로그인 사용자: profile 당 unique session 수
  logged_in AS (
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT i.session_id)::bigint AS visit_count
      FROM public.card_impressions i
      JOIN public.profiles p ON p.id = i.user_id
         , bounds b
     WHERE i.created_at >= b.since
       AND i.user_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  -- 비로그인 세션: 한 행으로 합쳐 표시. profile_id = NULL, display_name = '비로그인 방문자'.
  anon AS (
    SELECT NULL::uuid AS profile_id,
           '비로그인 방문자'::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT i.session_id)::bigint AS visit_count
      FROM public.card_impressions i, bounds b
     WHERE i.created_at >= b.since
       AND i.user_id IS NULL
       AND i.session_id IS NOT NULL
     HAVING COUNT(DISTINCT i.session_id) > 0
  )
  SELECT * FROM logged_in
  UNION ALL
  SELECT * FROM anon
  ORDER BY visit_count DESC, display_name
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors(integer, integer, integer) TO authenticated;

-- ── 3. get_top_cards_by_views 재정의 — session 단위 dedup ──
DROP FUNCTION IF EXISTS public.get_top_cards_by_views(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
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
    -- 로그인은 user_id 별 unique, 비로그인은 session_id 별 unique.
    SELECT v.card_id,
           COUNT(DISTINCT COALESCE(v.user_id::text, v.session_id))::bigint AS c
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
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer) TO authenticated;

-- ── 4. get_top_cards_by_shares 재정의 — session 단위 dedup ──
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
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
    -- 로그인은 user_id 별 unique, 비로그인은 session_id 별 unique.
    -- session_id 도 user_id 도 없으면(레거시 row) raw 카운트로 1.
    SELECT sh.card_id,
           COUNT(DISTINCT COALESCE(sh.user_id::text, sh.session_id, sh.id::text))::bigint AS c
      FROM public.card_shares sh, bounds b
     WHERE sh.created_at >= b.since
     GROUP BY sh.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer) TO authenticated;

-- ── 5. get_admin_kpi 재정의 ──
-- visitors / views / shares 모두 session-dedup. likes/saves/comments 는 로그인 액션이라 raw 유지.
CREATE OR REPLACE FUNCTION public.get_admin_kpi(p_days int DEFAULT 7)
RETURNS TABLE(
  visitors bigint,
  views bigint,
  comments bigint,
  likes bigint,
  saves bigint,
  shares bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT
    -- 방문자: card_impressions 의 unique (user|session). 비로그인 포함.
    (SELECT count(DISTINCT coalesce(i.user_id::text, i.session_id))::bigint
       FROM public.card_impressions i, bounds b
      WHERE i.created_at >= b.since
        AND (i.user_id IS NOT NULL OR i.session_id IS NOT NULL)) AS visitors,
    -- 조회수: card_views 의 unique (user|session). 한 세션의 여러 dwell row 는 1로.
    (SELECT count(DISTINCT coalesce(v.user_id::text, v.session_id))::bigint
       FROM public.card_views v, bounds b
      WHERE v.created_at >= b.since
        AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)) AS views,
    -- 댓글: 로그인 액션. raw row count.
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since AND c.status = 'visible') AS comments,
    -- 좋아요: 로그인 액션. raw.
    (SELECT count(*)::bigint
       FROM public.card_likes l, bounds b
      WHERE l.created_at >= b.since) AS likes,
    -- 저장: 로그인 액션. raw.
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since) AS saves,
    -- 공유: 비로그인 포함. session-dedup.
    (SELECT count(DISTINCT coalesce(sh.user_id::text, sh.session_id, sh.id::text))::bigint
       FROM public.card_shares sh, bounds b
      WHERE sh.created_at >= b.since) AS shares;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_kpi(int) TO authenticated;

COMMIT;

SELECT 'OK 0117' AS status;
