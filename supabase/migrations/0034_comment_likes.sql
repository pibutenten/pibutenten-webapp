-- 댓글 좋아요 (root + 답글 모두). qa_likes / qa_saves 패턴 동일.

create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_comment_likes_user on public.comment_likes(user_id);
create index if not exists idx_comment_likes_comment on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists comment_likes_self_select on public.comment_likes;
create policy comment_likes_self_select on public.comment_likes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists comment_likes_self_insert on public.comment_likes;
create policy comment_likes_self_insert on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists comment_likes_self_delete on public.comment_likes;
create policy comment_likes_self_delete on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.comment_likes to authenticated;
grant select on public.comment_likes to anon;

-- comments.like_count 자동 sync
create or replace function public.comments_like_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments set like_count = greatest(0, like_count - 1) where id = old.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_likes_count on public.comment_likes;
create trigger trg_comment_likes_count
  after insert or delete on public.comment_likes
  for each row execute function public.comments_like_count_sync();

-- 토글 RPC (atomic)
create or replace function public.toggle_comment_like(p_comment_id bigint)
returns table (liked boolean, like_count int)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'login required'; end if;
  if exists (select 1 from public.comment_likes where comment_id = p_comment_id and user_id = v_uid) then
    delete from public.comment_likes where comment_id = p_comment_id and user_id = v_uid;
    select c.like_count into v_count from public.comments c where c.id = p_comment_id;
    return query select false, v_count;
  else
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v_uid);
    select c.like_count into v_count from public.comments c where c.id = p_comment_id;
    return query select true, v_count;
  end if;
end;
$$;

grant execute on function public.toggle_comment_like(bigint) to authenticated;
