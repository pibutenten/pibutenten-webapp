-- 0251. 태그 매니저 관리자 백엔드 (2단계 A)
--
-- ① tag_dictionary admin 쓰기 RLS (공개 SELECT 유지 + admin INSERT/UPDATE/DELETE).
-- ② 집계 RPC get_tag_admin_overview(p_days) — 태그별 사용량(시간창)·검색량·생성일.
-- ③ 검수큐 처리 RPC resolve_tag_review(...) — 분류 지정 시 tag_dictionary upsert + 큐 제거.
-- ④ get_top_tags 정비 — 'tip' 잔재 제거 + 대상 전체 글 태그로 확대(doctor_id 한정 완화).
-- 모두 is_admin() 가드. tag_dictionary 데이터는 변경하지 않음(스키마/정책/함수만).

-- ─────────────────────────────────────────────
-- ① admin 쓰기 RLS (공개 SELECT 는 0247 정책 유지)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "tag_dictionary admin write" ON public.tag_dictionary;
CREATE POLICY "tag_dictionary admin write" ON public.tag_dictionary
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
GRANT INSERT, UPDATE, DELETE ON public.tag_dictionary TO authenticated;

-- ─────────────────────────────────────────────
-- ② 집계 RPC — 태그별 사용량/검색량/생성일
--    usage      : 시간창 내 published(전체 글) 카드의 keywords 등장 카드수
--    search_cnt : 시간창 내 search_logs(query=ko) 건수
--    first_card_at : 그 태그가 처음 등장한 카드 created_at(시간창 무관) — 생성일 대체값
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tag_admin_overview(p_days integer DEFAULT 0)
RETURNS TABLE (
  id bigint, ko text, category text, en text, parent_ko text,
  is_procedure boolean, onboarding text,
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
  SELECT d.id, d.ko, d.category, d.en, d.parent_ko, d.is_procedure, d.onboarding,
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

-- ─────────────────────────────────────────────
-- ③ 검수큐 처리 — 분류 지정 시 사전 upsert + 큐 제거 (admin 가드, 단일 tx)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_tag_review(
  p_ko text,
  p_category text,
  p_en text DEFAULT NULL,
  p_parent_ko text DEFAULT NULL,
  p_is_procedure boolean DEFAULT false,
  p_onboarding text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_category NOT IN ('피부고민','리프팅','스킨부스터','홈케어','피부상식','미지정') THEN
    RAISE EXCEPTION 'invalid category';
  END IF;
  INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, onboarding)
  VALUES (p_ko, p_category, p_en, p_parent_ko, COALESCE(p_is_procedure, false), p_onboarding)
  ON CONFLICT (ko) DO UPDATE
    SET category = EXCLUDED.category,
        en = COALESCE(EXCLUDED.en, public.tag_dictionary.en),
        parent_ko = EXCLUDED.parent_ko,
        is_procedure = EXCLUDED.is_procedure,
        onboarding = EXCLUDED.onboarding,
        updated_at = now();
  DELETE FROM public.tag_review_queue WHERE ko = p_ko;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_tag_review(text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tag_review(text,text,text,text,boolean,text) TO authenticated;

-- ─────────────────────────────────────────────
-- ④ get_top_tags 정비 — 'tip' 잔재 제거 + 전체 글 태그로 확대
--    (기존: category in ('qa','tip') AND doctor_id IS NOT NULL → published 전체)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_tags_inner(
  p_days integer DEFAULT 0,
  p_min_count integer DEFAULT 1,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(keyword text, cnt bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select t.keyword, count(*)::bigint as cnt
  from (
    select unnest(c.keywords) as keyword
    from public.cards c
    where c.status = 'published'
      and c.deleted_at is null
      and (p_days is null or p_days = 0
           or c.created_at > now() - (p_days || ' days')::interval)
  ) t
  where t.keyword is not null
    and length(trim(t.keyword)) > 0
  group by t.keyword
  having count(*) >= p_min_count
  order by cnt desc
  limit p_limit;
$$;
