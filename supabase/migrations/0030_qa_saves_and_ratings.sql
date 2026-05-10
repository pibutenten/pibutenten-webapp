-- v4 카드 액션: 저장 (북마크) + 평점 (별 1~5)
-- 둘 다 한 사용자가 한 글에 1개만 (UNIQUE).
-- persona 단위로 분리 (official/personal 별도).

-- 1) 저장 (북마크)
create table if not exists public.qa_saves (
  qa_id bigint not null references public.qas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona text not null default 'official',
  created_at timestamptz not null default now(),
  primary key (qa_id, user_id, persona)
);

create index if not exists idx_qa_saves_user_persona
  on public.qa_saves(user_id, persona, created_at desc);
create index if not exists idx_qa_saves_qa
  on public.qa_saves(qa_id);

alter table public.qa_saves enable row level security;

drop policy if exists qa_saves_self_select on public.qa_saves;
create policy qa_saves_self_select
  on public.qa_saves for select to authenticated
  using (user_id = auth.uid());

drop policy if exists qa_saves_self_insert on public.qa_saves;
create policy qa_saves_self_insert
  on public.qa_saves for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists qa_saves_self_delete on public.qa_saves;
create policy qa_saves_self_delete
  on public.qa_saves for delete to authenticated
  using (user_id = auth.uid());

-- qas.save_count 컬럼 + 자동 sync trigger
alter table public.qas
  add column if not exists save_count int not null default 0;

create or replace function public.qas_save_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.qas set save_count = save_count + 1 where id = new.qa_id;
  elsif tg_op = 'DELETE' then
    update public.qas set save_count = greatest(0, save_count - 1) where id = old.qa_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_qa_saves_count on public.qa_saves;
create trigger trg_qa_saves_count
  after insert or delete on public.qa_saves
  for each row execute function public.qas_save_count_sync();

-- 2) 평점 (1~5)
create table if not exists public.qa_ratings (
  qa_id bigint not null references public.qas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona text not null default 'official',
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (qa_id, user_id, persona)
);

create index if not exists idx_qa_ratings_qa
  on public.qa_ratings(qa_id);

alter table public.qa_ratings enable row level security;

drop policy if exists qa_ratings_public_select on public.qa_ratings;
create policy qa_ratings_public_select
  on public.qa_ratings for select to anon, authenticated
  using (true);

drop policy if exists qa_ratings_self_modify on public.qa_ratings;
create policy qa_ratings_self_modify
  on public.qa_ratings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- qas에 rating_avg, rating_count 컬럼 + sync
alter table public.qas
  add column if not exists rating_avg numeric(3, 2) not null default 0,
  add column if not exists rating_count int not null default 0;

create or replace function public.qas_rating_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qa_id bigint;
begin
  v_qa_id := coalesce(new.qa_id, old.qa_id);
  update public.qas
     set rating_avg = coalesce((
       select round(avg(rating)::numeric, 2)
         from public.qa_ratings where qa_id = v_qa_id
     ), 0),
     rating_count = (
       select count(*) from public.qa_ratings where qa_id = v_qa_id
     )
   where id = v_qa_id;
  return null;
end;
$$;

drop trigger if exists trg_qa_ratings_sync on public.qa_ratings;
create trigger trg_qa_ratings_sync
  after insert or update or delete on public.qa_ratings
  for each row execute function public.qas_rating_sync();
