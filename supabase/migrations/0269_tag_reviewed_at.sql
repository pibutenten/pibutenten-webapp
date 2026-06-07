-- 0269. 미지정 태그 검토(트리아지) 플래그 reviewed_at (발주 E)
--
-- 목적: '미지정' 태그를 운영자가 검토했는지 추적. NULL=미검토, 값=검토완료(잔류 처리).
--   분류 이동·병합·삭제는 미지정에서 자동 제외되고, '추천 표시 ON' 또는 '검토 완료(잔류)'는
--   미지정에 남되 reviewed_at=now() 로 검토됨 처리. additive·무파괴. 전체 NULL 로 시작.
-- get_tag_admin_overview 에 reviewed_at 컬럼 추가(RETURNS TABLE 변경 → DROP 후 재생성, 0268 본문 동일 + reviewed_at).

ALTER TABLE public.tag_dictionary ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DROP FUNCTION IF EXISTS public.get_tag_admin_overview(integer);

CREATE OR REPLACE FUNCTION public.get_tag_admin_overview(p_days integer DEFAULT 0)
RETURNS TABLE (
  id bigint, ko text, category text, en text, parent_ko text,
  is_procedure boolean, is_recommendable boolean, reviewed_at timestamptz, onboarding text,
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
  SELECT d.id, d.ko, d.category, d.en, d.parent_ko, d.is_procedure, d.is_recommendable, d.reviewed_at, d.onboarding,
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
