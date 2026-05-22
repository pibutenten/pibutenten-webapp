-- 0145: get_top_visitors 에 last_visit_at 컬럼 추가 + 비로그인 sticky-top 정렬 (2026-05-22)
--
-- 사용자 결정:
--   - 방문자 TOP UI 를 한 줄 1명 → 칩 형태 (여러 명 한 줄) 로 변경
--   - 정렬: ① 비로그인 항상 맨 위 (압도적 다수), ② visit_count DESC, ③ last_visit_at DESC
--   - 최근 방문 시각도 표시할 수 있게 last_visit_at 컬럼 반환
--
-- 회귀 위험: 반환 컬럼 추가라 호출 코드(StatsListClient)도 동시 수정 필요.
-- 호환성: 0144 와 동일한 데이터 소스 (impression ∪ view), 동일한 KST date dedup 로직 유지.

BEGIN;

-- ── (A) get_top_visitors_inner 재정의: last_visit_at 추가 ──
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
  visit_count bigint,
  last_visit_at timestamptz
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
  -- 비로그인 행은 profile_id IS NULL → ORDER BY (profile_id IS NOT NULL) ASC 로 anon 우선
  ORDER BY (profile_id IS NOT NULL) ASC,
           visit_count DESC,
           last_visit_at DESC NULLS LAST,
           display_name
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors_inner(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_visitors_inner(integer, integer, integer)
  FROM PUBLIC, anon;

-- ── (B) get_top_visitors wrapper 재정의 (signature 일치) ──
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
  visit_count bigint,
  last_visit_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_visitors_inner(p_days, p_limit, p_offset);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_visitors(integer, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_top_visitors(integer, integer, integer) FROM PUBLIC, anon;

COMMIT;
