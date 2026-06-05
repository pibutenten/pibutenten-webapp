-- 0235. get_indexable_tags — qa-only 정리 + 멱등 base CREATE
--
-- 배경: 함수가 category IN ('qa','tip') 로 집계했으나 'tip' 은 폐지 카테고리(현 0행, 마이그 0198
--   에서 doodle 로 통합)라 사실상 qa-only. 죽은 필터 제거 + review_summary 미추가(Q3 결정 = qa-only).
--   또한 기존 정의가 조건부 마이그(0092: `if exists ... create or replace`)에만 있어 멱등 base CREATE 부재
--   → 신규 환경 재구축 시 함수 미생성 위험. 본 마이그로 무조건 CREATE OR REPLACE 하여 폴더-DB 정합 확보.
--
-- 변경: category IN ('qa','tip') → category = 'qa'. 나머지(doctor_id IS NOT NULL, status='published',
--   p_min_count, keyword 집계, 반환 시그니처, STABLE/SECURITY DEFINER/search_path) 전부 불변.
--   tip=0행이라 반환 태그 집합 무변화(회귀 0).

CREATE OR REPLACE FUNCTION public.get_indexable_tags(p_min_count integer DEFAULT 1)
  RETURNS TABLE(keyword text, cnt bigint)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  select t.keyword, count(*)::bigint as cnt
  from (
    select unnest(c.keywords) as keyword
    from public.cards c
    where c.status = 'published'
      and c.category = 'qa'
      and c.doctor_id is not null
  ) t
  where t.keyword is not null
    and length(trim(t.keyword)) > 0
  group by t.keyword
  having count(*) >= p_min_count
  order by cnt desc;
$$;

GRANT EXECUTE ON FUNCTION public.get_indexable_tags(integer) TO anon, authenticated;
