-- =============================================================
-- 0092. get_top_tags / get_indexable_tags RPC fix
--
-- 배경:
--   0056 에서 정의된 get_top_tags 가 옛 public.qas 테이블 참조.
--   0070~0078 의 qas → cards rename 에서 일부 마이그레이션. 이후
--   public.qas → public.cards 갈아끼웠으나 `posted_as = 'official'` 필터를
--   그대로 두어 카드 테이블에 없는 컬럼 참조로 RPC 매번 실패.
--
-- 실제 cards 스키마 (2026-05-15 확인):
--   id, doctor_id, video_id, question, answer, meta, keywords, like_count,
--   view_count, published, created_at, updated_at, status, type, author_id,
--   is_pick, article_*, share_count, external_*, post_slug, post_year,
--   category, hide_doctor_credential, shortcode, save_count, rating_avg,
--   rating_count, pubmed_ref, pubmed_refs, impression_count
--   → posted_as 컬럼 없음.
--
-- fix:
--   `posted_as = 'official'` 필터 제거. 원 의도("공식 의사 글의 태그만 집계")는
--   `doctor_id is not null` 필터로 이미 충족 (의사 글만 doctor_id 채워짐).
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
    select unnest(c.keywords) as keyword
    from public.cards c
    where c.status = 'published'
      and c.category in ('qa', 'tip')
      and c.doctor_id is not null
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

grant execute on function public.get_top_tags(int, int, int) to anon, authenticated;

-- get_indexable_tags 도 동일 패턴 (있다면)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_indexable_tags'
  ) then
    execute $func$
      create or replace function public.get_indexable_tags(p_min_count int default 1)
      returns table(keyword text, cnt bigint)
      language sql
      stable security definer
      set search_path to 'public'
      as $f$
        select t.keyword, count(*)::bigint as cnt
        from (
          select unnest(c.keywords) as keyword
          from public.cards c
          where c.status = 'published'
            and c.category in ('qa', 'tip')
            and c.doctor_id is not null
        ) t
        where t.keyword is not null
          and length(trim(t.keyword)) > 0
        group by t.keyword
        having count(*) >= p_min_count
        order by cnt desc;
      $f$;
    $func$;
    execute 'grant execute on function public.get_indexable_tags(int) to anon, authenticated';
  end if;
end $$;

select 'OK' as status;
