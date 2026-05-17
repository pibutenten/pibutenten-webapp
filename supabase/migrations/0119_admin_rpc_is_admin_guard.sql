-- 0119: Admin KPI RPC 일괄 `is_admin()` 가드 추가 (A4, 2026-05-17)
--
-- 결함: 0046/0058/0061/0070/0087/0117/0118 에서 정의된 admin KPI RPC 들이
--       `SECURITY DEFINER` + `GRANT EXECUTE TO authenticated` 조합이면서
--       본문에 `public.is_admin()` 검사가 없어 일반 로그인 사용자가
--       PostgREST `/rest/v1/rpc/get_users_kpi` 등을 직접 호출하면
--       전체 회원 KPI / display_name+handle+visit_count 가 노출된다.
--
-- 대상 함수 (rename + wrapper 패턴 적용):
--   - public.get_users_kpi(integer)
--   - public.get_top_visitors(integer, integer, integer)
--   - public.get_top_cards_by_views(integer, integer, integer)
--   - public.get_top_cards_by_shares(integer, integer, integer)
--   - public.get_top_cards_by_comments(integer, integer, integer)
--   - public.get_top_cards_by_likes(integer, integer, integer)
--   - public.get_top_cards_by_saves(integer, integer, integer)
--   - public.get_admin_kpi(integer)
--   - public.get_card_activity_users(bigint, text, integer)
--
-- 전략:
--   1. 기존 함수를 `<name>_inner` 로 RENAME (본문 보존, 권한 회수).
--   2. 동일 이름 + 동일 시그니처의 plpgsql wrapper 함수 새로 CREATE.
--      - wrapper 가 `public.is_admin()` 검사 후 inner 호출.
--      - SECURITY DEFINER + search_path 고정.
--   3. wrapper 에만 authenticated EXECUTE 권한 부여.
--
-- 결과:
--   - 일반 사용자가 호출하면 `42501 unauthorized` 예외 발생.
--   - admin (묶음 안에 role='admin' profile 1개라도 있으면) 통과 → inner 실행.
--   - 함수 본문 자체는 RENAME 이라 회귀 없음. 시그니처도 동일.
--
-- 헬퍼 확인: public.is_admin() 는 0010_auth_profiles.sql:68 에서 정의,
--           0059_rls_phase9_group_aware.sql:39 에서 묶음(auth_user_id) 인지로 재정의됨.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 헬퍼 매크로 역할: 한 함수씩 rename + 권한 회수.
-- 각 wrapper 는 `RETURN QUERY SELECT * FROM public.<name>_inner(...)` 패턴.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) get_users_kpi
ALTER FUNCTION public.get_users_kpi(integer)
  RENAME TO get_users_kpi_inner;
REVOKE ALL ON FUNCTION public.get_users_kpi_inner(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_users_kpi(p_days integer DEFAULT 7)
RETURNS TABLE (
  profile_id uuid,
  visit_sessions bigint,
  views_received bigint,
  comments_written bigint,
  likes_received bigint,
  shares_received bigint
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
  RETURN QUERY SELECT * FROM public.get_users_kpi_inner(p_days);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_users_kpi(integer) TO authenticated;

-- 2) get_top_visitors
ALTER FUNCTION public.get_top_visitors(integer, integer, integer)
  RENAME TO get_top_visitors_inner;
REVOKE ALL ON FUNCTION public.get_top_visitors_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_visitors_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors(integer, integer, integer) TO authenticated;

-- 3) get_top_cards_by_views
ALTER FUNCTION public.get_top_cards_by_views(integer, integer, integer)
  RENAME TO get_top_cards_by_views_inner;
REVOKE ALL ON FUNCTION public.get_top_cards_by_views_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
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
  cnt bigint
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
  RETURN QUERY SELECT * FROM public.get_top_cards_by_views_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer) TO authenticated;

-- 4) get_top_cards_by_shares
ALTER FUNCTION public.get_top_cards_by_shares(integer, integer, integer)
  RENAME TO get_top_cards_by_shares_inner;
REVOKE ALL ON FUNCTION public.get_top_cards_by_shares_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
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
  cnt bigint
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
  RETURN QUERY SELECT * FROM public.get_top_cards_by_shares_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer) TO authenticated;

-- 5) get_top_cards_by_comments
ALTER FUNCTION public.get_top_cards_by_comments(integer, integer, integer)
  RENAME TO get_top_cards_by_comments_inner;
REVOKE ALL ON FUNCTION public.get_top_cards_by_comments_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
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
  cnt bigint
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
  RETURN QUERY SELECT * FROM public.get_top_cards_by_comments_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer) TO authenticated;

-- 6) get_top_cards_by_likes
ALTER FUNCTION public.get_top_cards_by_likes(integer, integer, integer)
  RENAME TO get_top_cards_by_likes_inner;
REVOKE ALL ON FUNCTION public.get_top_cards_by_likes_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
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
  cnt bigint
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
  RETURN QUERY SELECT * FROM public.get_top_cards_by_likes_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer) TO authenticated;

-- 7) get_top_cards_by_saves
ALTER FUNCTION public.get_top_cards_by_saves(integer, integer, integer)
  RENAME TO get_top_cards_by_saves_inner;
REVOKE ALL ON FUNCTION public.get_top_cards_by_saves_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
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
  cnt bigint
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
  RETURN QUERY SELECT * FROM public.get_top_cards_by_saves_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer) TO authenticated;

-- 8) get_admin_kpi
ALTER FUNCTION public.get_admin_kpi(integer)
  RENAME TO get_admin_kpi_inner;
REVOKE ALL ON FUNCTION public.get_admin_kpi_inner(integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_kpi(p_days integer DEFAULT 7)
RETURNS TABLE (
  visitors bigint,
  views bigint,
  comments bigint,
  likes bigint,
  saves bigint,
  shares bigint
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
  RETURN QUERY SELECT * FROM public.get_admin_kpi_inner(p_days);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_kpi(integer) TO authenticated;

-- 9) get_card_activity_users
ALTER FUNCTION public.get_card_activity_users(bigint, text, integer)
  RENAME TO get_card_activity_users_inner;
REVOKE ALL ON FUNCTION public.get_card_activity_users_inner(bigint, text, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_card_activity_users(
  p_card_id bigint,
  p_kind text,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
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
  RETURN QUERY SELECT * FROM public.get_card_activity_users_inner(p_card_id, p_kind, p_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_card_activity_users(bigint, text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증: 다음 쿼리로 admin 가드 누락된 SECURITY DEFINER 함수 sweep.
-- 0119 적용 후 실행하여 누락된 admin RPC 가 더 있는지 확인:
--
--   SELECT n.nspname, p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          p.prosecdef
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prosecdef = true
--      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
--    ORDER BY p.proname;
--
-- 결과 함수 본문에 is_admin()/auth.uid() 검사가 있는지 수동 확인.
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;
