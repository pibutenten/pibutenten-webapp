-- 0268. get_tag_admin_overview 에 is_recommendable 컬럼 추가 (L2-4 토글)
--
-- 태그 관리 화면 '자동추천' 토글용. RETURNS TABLE 시그니처 변경이라 DROP 후 재생성.
-- 0251 본문과 동일 + d.is_recommendable 추가(시술 후기 컬럼 옆 표시).

DROP FUNCTION IF EXISTS public.get_tag_admin_overview(integer);

CREATE OR REPLACE FUNCTION public.get_tag_admin_overview(p_days integer DEFAULT 0)
RETURNS TABLE (
  id bigint, ko text, category text, en text, parent_ko text,
  is_procedure boolean, is_recommendable boolean, onboarding text,
  created_at timestamptz, first_card_at timestamptz,
  usage bigint, search_cnt bigint
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
  WITH usage AS (
    SELECT u.kw AS ko, count(*)::bigint AS cnt
    FROM public.cards c, unnest(c.keywords) AS u(kw)
    WHERE c.deleted_at IS NULL AND c.status = 'published'
      AND (p_days IS NULL OR p_days = 0
           OR c.created_at > now() - (p_days || ' days')::interval)
    GROUP BY u.kw
  ),
  firstcard AS (
    SELECT f.kw AS ko, min(c.created_at) AS first_at
    FROM public.cards c, unnest(c.keywords) AS f(kw)
    WHERE c.deleted_at IS NULL
    GROUP BY f.kw
  ),
  searches AS (
    SELECT s.query AS ko, count(*)::bigint AS cnt
    FROM public.search_logs s
    WHERE (p_days IS NULL OR p_days = 0
           OR s.created_at > now() - (p_days || ' days')::interval)
    GROUP BY s.query
  )
  SELECT d.id, d.ko, d.category, d.en, d.parent_ko, d.is_procedure, d.is_recommendable, d.onboarding,
         d.created_at, fc.first_at,
         COALESCE(u.cnt, 0)::bigint, COALESCE(se.cnt, 0)::bigint
  FROM public.tag_dictionary d
  LEFT JOIN usage    u  ON u.ko  = d.ko
  LEFT JOIN firstcard fc ON fc.ko = d.ko
  LEFT JOIN searches se ON se.ko = d.ko
  ORDER BY COALESCE(u.cnt, 0) DESC, d.ko ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tag_admin_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tag_admin_overview(integer) TO authenticated;
