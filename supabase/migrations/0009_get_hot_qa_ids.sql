-- =============================================================
-- 0009. HOT Q&A ID 목록 RPC (get_hot_qa_ids)
--
-- 점수: (좋아요 × 2 + 조회수) × exp(-나이 / 90일)
--   - 90일 반감기 → 최근 글에 가중
-- 상위 N개 ID 반환 (default 20)
-- =============================================================

create or replace function public.get_hot_qa_ids(p_limit int default 20)
returns setof bigint
language sql
stable
as $func$
  select id
  from public.qas
  where published = true
  order by
    (coalesce(like_count, 0) * 2 + coalesce(view_count, 0))
      * exp(-extract(epoch from (now() - created_at)) / (60.0 * 60.0 * 24.0 * 90.0))
    desc nulls last,
    id desc
  limit greatest(1, least(100, p_limit));
$func$;

revoke all on function public.get_hot_qa_ids(int) from public;
grant execute on function public.get_hot_qa_ids(int) to anon, authenticated;
