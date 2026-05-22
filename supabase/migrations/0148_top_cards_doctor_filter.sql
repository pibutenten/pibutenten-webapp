-- 0148: get_top_cards_by_* 5개 RPC 에 doctor 필터 파라미터 추가 (2026-05-22)
--
-- 사용자 결정: 원장 대시보드의 KPI 카드 (조회수/댓글/저장/공유) 클릭 시
-- /admin/stats/{kind} 로 이동 → 관리자와 동일 UX. 단 active doctor 면 본인 글로 자동 필터링.
--
-- 신규 파라미터 (모든 inner+wrapper):
--   p_doctor_id          uuid DEFAULT NULL   — cards.doctor_id 매칭
--   p_author_profile_id  uuid DEFAULT NULL   — cards.author_id 매칭
--   두 값 모두 NULL → 사이트 전체 (admin 동작 그대로)
--   하나라도 값 → (c.doctor_id = p_doctor_id OR c.author_id = p_author_profile_id) 한정
--
-- wrapper 권한:
--   - NULL 호출 → is_admin() 만 (사이트 전체 통계)
--   - 값 있는 호출 → is_admin() OR caller 가 같은 doctor_id 보유 (본인 통계)
--
-- 영향 RPC 5개: views / shares / likes / saves / comments

BEGIN;

-- ============================================================================
-- (A) get_top_cards_by_views_inner — distinct visitor 단위
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_top_cards_by_views_inner(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_views_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
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
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views_inner(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_views_inner(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- (B) get_top_cards_by_shares_inner
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares_inner(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
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
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares_inner(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_shares_inner(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- (C) get_top_cards_by_likes_inner — distinct user
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes_inner(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
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
    SELECT l.card_id, COUNT(DISTINCT l.user_id)::bigint AS c
      FROM public.card_likes l, bounds b
     WHERE l.created_at >= b.since AND l.user_id IS NOT NULL
     GROUP BY l.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes_inner(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_likes_inner(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- (D) get_top_cards_by_saves_inner — distinct user
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves_inner(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
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
    SELECT s.card_id, COUNT(DISTINCT s.user_id)::bigint AS c
      FROM public.card_saves s, bounds b
     WHERE s.created_at >= b.since AND s.user_id IS NOT NULL
     GROUP BY s.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves_inner(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_saves_inner(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- (E) get_top_cards_by_comments_inner — row count
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments_inner(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments_inner(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
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
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible'
     GROUP BY cm.card_id
  )
  SELECT c.id AS card_id, c.question, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle, a.c AS cnt
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.deleted_at IS NULL
     AND (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments_inner(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_comments_inner(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- Wrappers — 권한 가드 (admin OR self-doctor)
-- 5개 wrapper 동일 시그니처: (p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._check_doctor_kpi_access(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.doctor_accounts da
    JOIN public.profiles p ON p.id = da.profile_id
    WHERE da.doctor_id = p_doctor_id AND p.auth_user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public._check_doctor_kpi_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._check_doctor_kpi_access(uuid) TO authenticated;

-- (A) views wrapper
DROP FUNCTION IF EXISTS public.get_top_cards_by_views(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_views(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_views_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_views(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- (B) shares wrapper
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_shares_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- (C) likes wrapper
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_likes_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- (D) saves wrapper
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_saves_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

-- (E) comments wrapper
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments(integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL,
  p_author_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(card_id bigint, question text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_comments_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid) FROM PUBLIC, anon;

COMMIT;
