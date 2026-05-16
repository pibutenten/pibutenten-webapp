-- 0118: get_users_kpi 방문 정의 통일 — 0117 policy 와 동일하게 세션 단위 dedup.
--
-- 배경:
--   0046 의 get_users_kpi.visit_days 는 qa_views (compat view → card_views) 의
--   COUNT(DISTINCT created_at::date) 로 정의. 같은 세션 안에서 여러 페이지 뷰가
--   있어도 날짜만 같으면 1, 다음 날 또 보면 +1.
--
--   0117 에서 /admin/stats/visitors (get_top_visitors) 는 card_impressions 의
--   COUNT(DISTINCT session_id) 로 통일됨 — "같은 세션 = 1 방문" 정책.
--
--   /admin/users 의 "방문" 컬럼이 다른 정의를 쓰면 admin 이 혼란. 통일.
--
-- 변경:
--   - visit_days → visit_sessions (필드명 변경, 의미 = COUNT(DISTINCT session_id))
--   - 소스: qa_views (= card_views) → card_impressions
--   - 같은 정책 (0117 와 동일): user_id IS NOT NULL 행만 — 회원 KPI 이므로 비로그인 제외.
--
-- views_received / likes_received / comments_written / shares_received 는 그대로 (정확한
-- COUNT 의미를 갖고 있어 session-dedup 부적절).
--
-- ⚠️ 프론트 (`/admin/users/page.tsx`) 는 visit_days → visit_sessions 로 맞춰서
-- 동시 배포 필요.

BEGIN;

DROP FUNCTION IF EXISTS public.get_users_kpi(integer);

CREATE OR REPLACE FUNCTION public.get_users_kpi(p_days integer DEFAULT 7)
RETURNS TABLE (
  profile_id uuid,
  visit_sessions bigint,    -- 그 회원의 세션 단위 방문 수 (card_impressions distinct session_id)
  views_received bigint,    -- 그 회원이 작성한 글의 총 조회수 (card_views COUNT)
  comments_written bigint,  -- 그 회원이 작성한 댓글 수 (status = visible)
  likes_received bigint,    -- 그 회원의 글들이 받은 좋아요 수
  shares_received bigint    -- 그 회원의 글들이 받은 공유 수
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
  vs AS ( -- 회원별 세션 단위 방문 (card_impressions, 0117 정책 동일)
    SELECT i.user_id AS pid,
           COUNT(DISTINCT i.session_id)::bigint AS d
      FROM card_impressions i, bounds b
     WHERE i.created_at >= b.since
       AND i.user_id IS NOT NULL
       AND i.session_id IS NOT NULL
     GROUP BY i.user_id
  ),
  vw AS ( -- 회원 글의 조회수
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM card_views v JOIN cards c ON c.id = v.card_id, bounds b
     WHERE v.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  cw AS ( -- 회원이 작성한 댓글
    SELECT cm.author_id AS pid, COUNT(*)::bigint AS c
      FROM comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible' AND cm.author_id IS NOT NULL
     GROUP BY cm.author_id
  ),
  lk AS ( -- 회원 글의 좋아요
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM card_likes l JOIN cards c ON c.id = l.card_id, bounds b
     WHERE l.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  ),
  sh AS ( -- 회원 글의 공유
    SELECT c.author_id AS pid, COUNT(*)::bigint AS c
      FROM card_shares s JOIN cards c ON c.id = s.card_id, bounds b
     WHERE s.created_at >= b.since AND c.author_id IS NOT NULL
     GROUP BY c.author_id
  )
  SELECT p.id AS profile_id,
         COALESCE(vs.d, 0) AS visit_sessions,
         COALESCE(vw.c, 0) AS views_received,
         COALESCE(cw.c, 0) AS comments_written,
         COALESCE(lk.c, 0) AS likes_received,
         COALESCE(sh.c, 0) AS shares_received
    FROM profiles p
    LEFT JOIN vs ON vs.pid = p.id
    LEFT JOIN vw ON vw.pid = p.id
    LEFT JOIN cw ON cw.pid = p.id
    LEFT JOIN lk ON lk.pid = p.id
    LEFT JOIN sh ON sh.pid = p.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_kpi(integer) TO authenticated;

COMMIT;
