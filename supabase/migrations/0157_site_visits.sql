-- 0157: site_visits 테이블 (2026-05-23)
--
-- 배경:
--   사용자 보고 (이도영 원장 케이스): 사이트 접속해서 카드 [지우기] 시도까지 했는데
--   방문자 TOP 에 안 나타남. DB 확인 결과 이도영의 24h 내 card_views=0, impressions=0.
--   기존 방문자 정의 = "카드 impression 또는 view 가 있는 사용자" — 알림으로 본인 카드
--   편집 화면(/write/...) 으로 바로 진입한 경우 카드 view 이벤트가 안 생겨 미카운트.
--
-- 해결: 페이지 진입 자체를 추적하는 별도 테이블 신설.
--   - 미들웨어에서 로그인 사용자의 페이지 진입 시 INSERT
--   - get_top_visitors_inner RPC 가 events 에 site_visits 도 UNION
--   - "1일 1방문 (KST)" 정의 동일 적용 (COUNT DISTINCT 날짜)
--
-- 테이블 구조: card_impressions / card_views 와 비슷한 형식 (user_id/session_id/created_at).

CREATE TABLE IF NOT EXISTS public.site_visits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_user_created
  ON public.site_visits (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_visits_session_created
  ON public.site_visits (session_id, created_at DESC)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_visits_created
  ON public.site_visits (created_at DESC);

-- RLS: anon/authenticated INSERT 허용 (미들웨어가 user 컨텍스트로 직접 적재).
--   SELECT 는 admin 만 (대시보드 RPC 는 SECURITY DEFINER 라 RLS 우회).
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_visits_admin_select ON public.site_visits;
CREATE POLICY site_visits_admin_select ON public.site_visits
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS site_visits_anon_insert ON public.site_visits;
CREATE POLICY site_visits_anon_insert ON public.site_visits
  FOR INSERT
  WITH CHECK (true);

GRANT INSERT ON public.site_visits TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.site_visits_id_seq TO anon, authenticated;

-- get_top_visitors_inner RPC 갱신 — site_visits 도 events 에 포함.
CREATE OR REPLACE FUNCTION public.get_top_visitors_inner(
  p_days INT DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  profile_id UUID,
  display_name TEXT,
  handle TEXT,
  visit_count BIGINT,
  last_visit_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    UNION ALL
    SELECT user_id, session_id, created_at FROM public.site_visits
     WHERE created_at >= (SELECT since FROM bounds)
  ),
  logged_in AS (
    SELECT p.id AS profile_id,
           p.display_name,
           p.handle,
           COUNT(DISTINCT (e.created_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
      JOIN public.profiles p ON p.id = e.user_id
     WHERE e.user_id IS NOT NULL
     GROUP BY p.id, p.display_name, p.handle
  ),
  anon AS (
    SELECT NULL::uuid AS profile_id,
           '비로그인 방문자'::text AS display_name,
           NULL::text AS handle,
           COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date))::bigint AS visit_count,
           MAX(e.created_at) AS last_visit_at
      FROM events e
     WHERE e.user_id IS NULL AND e.session_id IS NOT NULL
     HAVING COUNT(DISTINCT (e.session_id, (e.created_at AT TIME ZONE 'Asia/Seoul')::date)) > 0
  )
  SELECT * FROM (
    SELECT * FROM anon
    UNION ALL
    SELECT * FROM logged_in
  ) all_rows
  ORDER BY (profile_id IS NOT NULL) ASC,
           visit_count DESC,
           last_visit_at DESC NULLS LAST,
           display_name
  LIMIT p_limit OFFSET p_offset;
$$;

-- 같은 패턴으로 admin/users KPI inner 도 갱신 (visitors 카운트).
CREATE OR REPLACE FUNCTION public.get_admin_kpi_inner(p_days INT DEFAULT 1)
RETURNS TABLE (
  visitors BIGINT,
  new_members BIGINT,
  views BIGINT,
  new_cards BIGINT,
  comments BIGINT,
  likes BIGINT,
  saves BIGINT,
  shares BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    UNION ALL
    SELECT user_id, session_id, created_at FROM public.site_visits
     WHERE created_at >= (SELECT since FROM bounds)
  )
  SELECT
    (SELECT COUNT(DISTINCT (
        COALESCE(user_id::text, session_id),
        (created_at AT TIME ZONE 'Asia/Seoul')::date
      )) FROM events WHERE COALESCE(user_id::text, session_id) IS NOT NULL)::bigint AS visitors,
    (SELECT COUNT(*) FROM public.profiles
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS new_members,
    (SELECT COUNT(*) FROM events)::bigint AS views,
    (SELECT COUNT(*) FROM public.cards
      WHERE created_at >= (SELECT since FROM bounds) AND deleted_at IS NULL)::bigint AS new_cards,
    (SELECT COUNT(*) FROM public.comments
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS comments,
    (SELECT COUNT(*) FROM public.card_likes
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS likes,
    (SELECT COUNT(*) FROM public.card_saves
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS saves,
    (SELECT COUNT(*) FROM public.card_shares
      WHERE created_at >= (SELECT since FROM bounds))::bigint AS shares;
$$;

-- 검증
SELECT 'site_visits created' AS status;
