-- 0146: 활동통계 KPI 2개 추가 (new_members, new_cards) + TOP RPC 2개 신설 (2026-05-22)
--
-- 사용자 결정:
--   - 관리자 대시보드 활동통계 8개 (방문자, 새 회원, 조회수, 새 글, 댓글, 좋아요, 저장, 공유)
--   - 모바일 4열×2행 / 데스크탑 8열×1행
--   - 새 회원 / 새 글 카드 클릭 시 TOP 리스트로 진입 (/admin/stats/new-members, /admin/stats/new-cards)
--
-- 정의:
--   new_members = profiles 중 created_at >= since AND deleted_at IS NULL (탈퇴자 제외)
--   new_cards   = cards    중 created_at >= since AND status = 'published' AND deleted_at IS NULL
--
-- 신규 wrapper/inner 4개:
--   - get_admin_kpi_inner / get_admin_kpi  (RETURNS TABLE 컬럼 +2)
--   - get_top_new_members_inner / get_top_new_members  (NEW)
--   - get_top_new_cards_inner   / get_top_new_cards    (NEW)

BEGIN;

-- ── (A) get_admin_kpi_inner 재정의: new_members, new_cards 추가 ──
DROP FUNCTION IF EXISTS public.get_admin_kpi_inner(integer);
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
  )
  SELECT
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
    (SELECT count(DISTINCT (
       COALESCE(v.user_id::text, v.session_id),
       (v.created_at AT TIME ZONE 'Asia/Seoul')::date
     ))::bigint
       FROM public.card_views v, bounds b
      WHERE v.created_at >= b.since
        AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)) AS views,
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
    (SELECT count(*)::bigint
       FROM public.card_shares sh, bounds b
      WHERE sh.created_at >= b.since) AS shares;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_kpi_inner(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_kpi_inner(integer) FROM PUBLIC, anon;

-- ── (B) get_admin_kpi wrapper 재정의 ──
DROP FUNCTION IF EXISTS public.get_admin_kpi(integer);
CREATE OR REPLACE FUNCTION public.get_admin_kpi(p_days integer DEFAULT 7)
RETURNS TABLE (
  visitors bigint,
  new_members bigint,
  views bigint,
  new_cards bigint,
  comments bigint,
  likes bigint,
  saves bigint,
  shares bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_admin_kpi_inner(p_days);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_kpi(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_kpi(integer) FROM PUBLIC, anon;

-- ── (C) get_top_new_members_inner — 최근 가입 회원 ──
CREATE OR REPLACE FUNCTION public.get_top_new_members_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  handle text,
  role text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT p.id, p.display_name, p.handle, p.role, p.created_at
    FROM public.profiles p, bounds b
   WHERE p.created_at >= b.since
     AND p.deleted_at IS NULL
   ORDER BY p.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_new_members_inner(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_new_members_inner(integer, integer, integer) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_top_new_members(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  handle text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_new_members_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_new_members(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_new_members(integer, integer, integer) FROM PUBLIC, anon;

-- ── (D) get_top_new_cards_inner — 최근 발행 글 ──
CREATE OR REPLACE FUNCTION public.get_top_new_cards_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  card_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT c.id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, c.created_at
    FROM public.cards c
    CROSS JOIN bounds b
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.created_at >= b.since
     AND c.status = 'published'
     AND c.deleted_at IS NULL
   ORDER BY c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_new_cards_inner(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_new_cards_inner(integer, integer, integer) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_top_new_cards(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  card_id bigint,
  question text,
  shortcode text,
  author_id uuid,
  author_name text,
  author_handle text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_new_cards_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_new_cards(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_new_cards(integer, integer, integer) FROM PUBLIC, anon;

COMMIT;
