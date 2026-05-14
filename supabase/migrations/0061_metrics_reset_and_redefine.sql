-- 0061: 메트릭 정의 재정립 + 데이터 전체 리셋
--
-- 변경:
--   1. qa_views, qa_impressions 전체 TRUNCATE
--   2. qas.view_count, qas.impression_count 모두 0으로 리셋
--   3. get_admin_kpi 재정의:
--      - visitors = distinct (user_id|session_id) FROM qa_impressions  (페이지 방문)
--      - views    = count(*) FROM qa_views  (4-10초 dwell 통과)
--   4. get_top_visitors 재정의: qa_impressions 기반
--
-- 배경: 옛 마운트 즉시 INSERT 데이터(qa_views)가 누적되어 새 dwell 기준과 섞임.
--       qa_impressions는 노출 = 페이지에 등장 = "방문" 으로 가장 자연스러움.

-- 1. 누적 데이터 리셋
TRUNCATE TABLE public.qa_views RESTART IDENTITY;
TRUNCATE TABLE public.qa_impressions RESTART IDENTITY;
UPDATE public.qas SET view_count = 0 WHERE view_count <> 0;
UPDATE public.qas SET impression_count = 0 WHERE impression_count <> 0;

-- 2. get_admin_kpi 재정의 (visitors = impressions 기반)
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
    -- 방문자: qa_impressions 기반 unique (user|session). 페이지에 카드가 등장한 = 방문.
    (SELECT count(DISTINCT coalesce(i.user_id::text, i.session_id))::bigint
       FROM public.qa_impressions i, bounds b
      WHERE i.created_at >= b.since) AS visitors,
    -- 조회: qa_views row count. dwell 4-10초 + 명시 의도 통과.
    (SELECT count(*)::bigint
       FROM public.qa_views v, bounds b
      WHERE v.created_at >= b.since) AS views,
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since AND c.status = 'visible') AS comments,
    (SELECT count(*)::bigint
       FROM public.qa_likes l, bounds b
      WHERE l.created_at >= b.since) AS likes,
    (SELECT count(*)::bigint
       FROM public.qa_saves s, bounds b
      WHERE s.created_at >= b.since) AS saves,
    (SELECT count(*)::bigint
       FROM public.qa_shares sh, bounds b
      WHERE sh.created_at >= b.since) AS shares;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_kpi(int) TO authenticated;

-- 3. get_top_visitors 재정의 — qa_impressions 기반
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
  )
  SELECT p.id AS profile_id,
         p.display_name,
         p.handle,
         COUNT(DISTINCT i.session_id)::bigint AS visit_count
    FROM public.qa_impressions i
    JOIN public.profiles p ON p.id = i.user_id
       , bounds b
   WHERE i.created_at >= b.since
     AND i.user_id IS NOT NULL
   GROUP BY p.id, p.display_name, p.handle
   ORDER BY visit_count DESC, p.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_visitors(integer, integer, integer) TO authenticated;

SELECT 'OK 0061' AS status;
