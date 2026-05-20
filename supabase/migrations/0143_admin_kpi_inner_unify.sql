-- 0143: admin / users 통계 RPC 전수 통일 (2026-05-20)
--
-- 0142 후속 — 대시보드 관련 RPC 전체 점검 결과 발견된 누더기를 한 번에 정리:
--
-- (A) get_admin_kpi_inner (/admin 6개 KPI 카드)
--     이전: visitors = card_impressions distinct (impression-only).
--           views    = card_views row count (raw).
--     문제: 단독 페이지 진입자가 impression 0건이라 방문자 통계 누락. raw row count
--           는 같은 세션의 같은 카드 펼침/좋아요/공유 각각 카운트되어 부풀려짐.
--     이후: visitors = card_impressions ∪ card_views distinct (user|session).
--           views    = card_views distinct visitor.
--
-- (B) get_users_kpi_inner (/admin/users 회원관리 페이지)
--     이전: visit_sessions = card_impressions distinct session, user_id IS NOT NULL 가드.
--     문제: 동일 — 단독 진입자(외부 링크 유입) 통째 누락.
--     이후: card_impressions ∪ card_views distinct session 합산.
--
-- (C) get_top_cards_by_likes_inner / _by_saves_inner (/admin/stats/likes, /saves)
--     이전: COUNT(*) raw row count. like/save 는 toggle 이라 사실상 distinct user 와
--           같지만 정책 명확화 위해 distinct visitor 패턴으로 통일.
--     이후: COUNT(DISTINCT COALESCE(user_id::text, ...)) 패턴.
--
-- (D) get_top_cards_by_comments_inner (/admin/stats/comments)
--     이전: COUNT(*) — 댓글 수.
--     결정: TOP cards 의 댓글 카운트는 "활발한 글" 신호이므로 row count 유지. 단,
--           정책 명문화 위해 주석 보강.
--
-- (E) get_card_activity_users_inner — 이미 DISTINCT ON (user 별 1행), 변경 불필요.

BEGIN;

-- ── (A) get_admin_kpi_inner ──
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
    SELECT user_id, session_id FROM public.card_impressions
     WHERE created_at >= (SELECT since FROM bounds)
    UNION ALL
    SELECT user_id, session_id FROM public.card_views
     WHERE created_at >= (SELECT since FROM bounds)
  )
  SELECT
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.session_id))::bigint
       FROM events e
      WHERE e.user_id IS NOT NULL OR e.session_id IS NOT NULL) AS visitors,
    (SELECT count(DISTINCT coalesce(v.user_id::text, v.session_id))::bigint
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

-- ── (B) get_users_kpi_inner ──
-- visit_sessions = 회원이 impression ∪ view 어디든 흔적 남긴 distinct session.
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
    -- impression + view 합산: 회원별 distinct session 수
    SELECT e.user_id AS pid,
           COUNT(DISTINCT e.session_id)::bigint AS d
      FROM (
        SELECT user_id, session_id FROM public.card_impressions
         WHERE created_at >= (SELECT since FROM bounds) AND user_id IS NOT NULL
         UNION ALL
        SELECT user_id, session_id FROM public.card_views
         WHERE created_at >= (SELECT since FROM bounds) AND user_id IS NOT NULL
      ) e
     WHERE e.session_id IS NOT NULL
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

-- ── (C) get_top_cards_by_likes_inner — distinct visitor 패턴 ──
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes_inner(
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
    -- like 는 toggle 이라 사실상 distinct user. COUNT DISTINCT 로 명문화.
    SELECT l.card_id, COUNT(DISTINCT l.user_id)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since AND l.user_id IS NOT NULL
     GROUP BY l.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;

-- ── (D) get_top_cards_by_saves_inner — distinct visitor 패턴 ──
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves_inner(
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
    -- save 도 toggle 이라 사실상 distinct user. COUNT DISTINCT 로 명문화.
    SELECT s.card_id, COUNT(DISTINCT s.user_id)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since AND s.user_id IS NOT NULL
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;

-- ── (E) get_top_cards_by_comments_inner — row count 유지 (정책 명문화) ──
-- 댓글 TOP 은 "활발한 글" 신호 — 같은 사람이 여러 댓글 단 경우도 카운트.
-- (방문자/조회 와 정책이 다른 이유: 인터랙션 자체 횟수가 콘텐츠 활기 지표)
COMMENT ON FUNCTION public.get_top_cards_by_comments_inner(integer, integer, integer)
IS '댓글 row 수 기준 카드 TOP. 같은 사람의 여러 댓글도 각각 카운트 — "활발한 글" 신호.';

-- ── (F) get_card_activity_users — p_days 시간 윈도우 파라미터 추가 ──
--
-- 사용자 보고 (2026-05-20): "조회된 글 TOP의 cnt 가 6 인데 펼친 닉네임 칩은 14명".
-- 진단: 옛 정의는 시간 윈도우 없이 card_views 의 전체 기간을 가져옴. cnt 는 24h
-- (get_top_cards_by_views_inner 가 시간 윈도우 적용) 라 둘이 불일치.
--
-- 수정: p_days 파라미터 추가, 모든 kind 분기에 시간 윈도우 적용. 호출처
-- (StatsListClient) 도 같은 days 값 전달하도록 클라이언트 코드 동시 변경.
DROP FUNCTION IF EXISTS public.get_card_activity_users(bigint, text, integer);
DROP FUNCTION IF EXISTS public.get_card_activity_users_inner(bigint, text, integer);

CREATE OR REPLACE FUNCTION public.get_card_activity_users_inner(
  p_card_id bigint,
  p_kind text,
  p_limit integer DEFAULT 30,
  p_days integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  acted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := CASE
    WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
    ELSE now() - (p_days || ' days')::interval
  END;
BEGIN
  IF p_kind = 'likes' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      l.created_at
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE l.card_id = p_card_id
      AND l.created_at >= v_since
    ORDER BY p.id, l.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'saves' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      s.created_at
    FROM public.card_saves s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE s.card_id = p_card_id
      AND s.created_at >= v_since
    ORDER BY p.id, s.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'shares' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      sh.created_at
    FROM public.card_shares sh
    JOIN public.profiles p ON p.id = sh.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE sh.card_id = p_card_id
      AND sh.user_id IS NOT NULL
      AND sh.created_at >= v_since
    ORDER BY p.id, sh.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'views' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      v.created_at
    FROM public.card_views v
    JOIN public.profiles p ON p.id = v.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE v.card_id = p_card_id
      AND v.user_id IS NOT NULL
      AND v.created_at >= v_since
    ORDER BY p.id, v.created_at DESC
    LIMIT p_limit;

  ELSE
    RETURN;
  END IF;
END;
$$;

-- wrapper — is_admin() 가드 + p_days 전파
CREATE OR REPLACE FUNCTION public.get_card_activity_users(
  p_card_id bigint,
  p_kind text,
  p_limit integer DEFAULT 30,
  p_days integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  acted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM public.get_card_activity_users_inner(p_card_id, p_kind, p_limit, p_days);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_card_activity_users(bigint, text, integer, integer) TO authenticated;

COMMIT;
