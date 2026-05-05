-- =============================================================
-- 0007. 좋아요 취소용 RPC (decrement_qa_like)
-- =============================================================

create or replace function public.decrement_qa_like(p_qa_id bigint)
returns int
language sql
security definer
set search_path = public
as $func$
  update public.qas
     set like_count = greatest(0, like_count - 1)
   where id = p_qa_id and published = true
  returning like_count;
$func$;

revoke all on function public.decrement_qa_like(bigint) from public;
grant execute on function public.decrement_qa_like(bigint) to anon, authenticated;
