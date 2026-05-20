-- 0142: 방문자 / 조회 / 공유 통계 RPC 정책 재통일 (2026-05-20)
--
-- 배경 — 사용자 보고:
--   "방문자 TOP 에 배정민·피부텐텐 2명만 나옴. 글 쓴 반짝이 등 다른 회원은 분명히
--    로그인하고 글을 봤는데 누락. 24h 카드 조회수가 4 인데 좋아요·댓글 활동 보면
--    더 많은 사람이 본 게 분명한 카드도 있음."
--
-- 진단 (Supabase Management API 직접 질의):
--   - 24h impression 사용자: 단 2명 (배정민 300 row / 피부텐텐 61 row).
--     그러나 24h view 사용자는 8명 (배스킨·개발자·배정민·피부텐텐·반짝이·김종식·
--     해파리냉채·비로그인). 즉 view 6명은 impression 0건 = 통계 누락.
--   - 원인: `useCardViewer.ts` 의 impression effect 가 `if (forceExpanded) return`
--     으로 단독 페이지(`/[handle]/[shortcode]` 등 외부 링크·검색 직접 진입)를 통째로
--     제외. 코드 fix 와 함께 본 마이그레이션 적용.
--   - RPC 회귀: 0117 의 새 정책이 0119(_inner wrapper 패턴 분리) 시점에 옛 로직이
--     `_inner` 함수로 그대로 박혀버려 비로그인 UNION + COUNT DISTINCT 패턴이 모두 회귀.
--
-- 새 정책 (사용자 결정 — "전체 통일"):
--   1. 방문자 = card_impressions ∪ card_views 에 흔적 남긴 사람. 로그인은 user_id 별,
--      비로그인은 session_id 별 unique 합산. 비로그인은 한 행으로 묶어 "비로그인 방문자".
--   2. 조회수 (TOP cards) = card_views 의 distinct (user_id 우선, 없으면 session_id).
--      한 사람이 좋아요+공유+펼침 모두 해도 1회만 카운트 (sessionStorage 가드).
--   3. 공유 TOP = card_shares 의 distinct (user_id 우선, 없으면 session_id).

BEGIN;

-- ── 0. card_shares.session_id 컬럼 보강 ──
-- 0117 의 ALTER 가 production 에 적용되지 않은 상태에서 0119(_inner wrapper)가 RPC만 새로
-- 만들어 거치며 컬럼 부재가 잠재한 것이 확인됨. 비로그인 공유 dedup 키 확보를 위해 보강.
ALTER TABLE public.card_shares
  ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_card_shares_session
  ON public.card_shares (session_id) WHERE session_id IS NOT NULL;

-- ── 1. get_top_visitors_inner — impression ∪ view 합산 distinct ──
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
  -- impression + view 합산. user_id 우선, NULL이면 session_id 단위.
  events AS (
    SELECT user_id, session_id, created_at
      FROM public.card_impressions
    UNION ALL
    SELECT user_id, session_id, created_at
      FROM public.card_views
  ),
  -- 로그인 사용자: profile 당 unique (user_id, session_id) 페어 수 = 방문 횟수
  --   같은 user 가 모바일·PC 두 세션 = 2 visit. 정확.
  logged_in AS (
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT e.session_id)::bigint AS visit_count
      FROM events e
      JOIN public.profiles p ON p.id = e.user_id
         , bounds b
     WHERE e.created_at >= b.since
       AND e.user_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  -- 비로그인 세션: 한 행으로 합쳐 표시.
  anon AS (
    SELECT NULL::uuid AS profile_id,
           '비로그인 방문자'::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT e.session_id)::bigint AS visit_count
      FROM events e, bounds b
     WHERE e.created_at >= b.since
       AND e.user_id IS NULL
       AND e.session_id IS NOT NULL
     HAVING COUNT(DISTINCT e.session_id) > 0
  )
  SELECT * FROM logged_in
  UNION ALL
  SELECT * FROM anon
  ORDER BY visit_count DESC, display_name
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors_inner(integer, integer, integer) TO authenticated;

-- ── 2. get_top_cards_by_views_inner — distinct visitor 단위 ──
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
    -- 로그인은 user_id 별 unique, 비로그인은 session_id 별 unique.
    -- 한 사람이 같은 카드를 펼침+좋아요+공유 모두 해도 1로 카운트
    -- (sessionStorage `pibutenten:view:${id}` 가드가 클라이언트 중복 INSERT 차단).
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
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views_inner(integer, integer, integer) TO authenticated;

-- ── 3. get_top_cards_by_shares_inner — distinct visitor 단위 ──
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares_inner(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares_inner(
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
    SELECT s.card_id,
           COUNT(DISTINCT COALESCE(s.user_id::text, s.session_id))::bigint AS c
      FROM public.card_shares s, bounds b
     WHERE s.created_at >= b.since
       AND (s.user_id IS NOT NULL OR s.session_id IS NOT NULL)
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares_inner(integer, integer, integer) TO authenticated;

COMMIT;
