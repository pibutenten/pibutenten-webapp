-- =============================================================
-- 0056. 인기 태그 RPC에 기간 매개변수 추가
--
-- 기존 get_indexable_tags(p_min_count) 는 누적만.
-- 새 get_top_tags(p_days, p_min_count, p_limit) — 기간 필터 + LIMIT.
-- p_days = 0 (또는 NULL)이면 전체 누적.
-- =============================================================

create or replace function public.get_top_tags(
  p_days int default 0,
  p_min_count int default 1,
  p_limit int default 10
)
returns table(keyword text, cnt bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select t.keyword, count(*)::bigint as cnt
  from (
    select unnest(q.keywords) as keyword
    from public.qas q
    where q.status = 'published'
      and q.posted_as = 'official'
      and q.category in ('qa', 'tip')
      and q.doctor_id is not null
      and (p_days is null or p_days = 0
           or q.created_at > now() - (p_days || ' days')::interval)
  ) t
  where t.keyword is not null
    and length(trim(t.keyword)) > 0
  group by t.keyword
  having count(*) >= p_min_count
  order by cnt desc
  limit p_limit;
$$;

grant execute on function public.get_top_tags(int, int, int) to anon, authenticated;

select 'OK' as status;
