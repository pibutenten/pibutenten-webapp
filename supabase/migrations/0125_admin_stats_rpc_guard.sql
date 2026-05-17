-- 0125: get_top_search_queries / get_top_tags 에 admin 가드 추가 (A4 sweep 후속, 2026-05-17)
--
-- 배경:
--   pg_proc sweep 결과 두 RPC 모두 SECURITY DEFINER + GRANT EXECUTE TO authenticated
--   조합인데 본문에 가드 없음. 사용처는 `/admin/page.tsx` 한 곳뿐(admin 전용 페이지).
--   그러나 PostgREST 로 일반 로그인 사용자가 직접 호출 가능 → admin 통계 누설.
--
--   `get_indexable_tags`, `get_recent_card_likers_batch` 는 sitemap/피드 공개 의도라
--   가드 추가 X. `is_notification_enabled`, `get_recent_likers` 는 호출 위치 없음(legacy)
--   이라 본 마이그레이션에서 제외.
--
-- 패턴: 0119 와 동일 rename + plpgsql wrapper.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) get_top_search_queries
-- ─────────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_top_search_queries(integer, integer)
  RENAME TO get_top_search_queries_inner;
REVOKE ALL ON FUNCTION public.get_top_search_queries_inner(integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_search_queries(
  p_days integer,
  p_limit integer
)
RETURNS TABLE (query text, cnt bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_search_queries_inner(p_days, p_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_search_queries(integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) get_top_tags
-- ─────────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_top_tags(integer, integer, integer)
  RENAME TO get_top_tags_inner;
REVOKE ALL ON FUNCTION public.get_top_tags_inner(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_top_tags(
  p_days integer,
  p_min_count integer,
  p_limit integer
)
RETURNS TABLE (keyword text, cnt bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_tags_inner(p_days, p_min_count, p_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_tags(integer, integer, integer) TO authenticated;

COMMIT;
