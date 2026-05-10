-- v4 multi-identity: 한 user가 여러 identity(닉네임+id+아바타+role)를 가질 수 있는 모델.
--
-- 기존 profiles는 그대로 유지 (auth.users와 1:1, primary identity 역할).
-- profile_identities는 추가 identity들 — '개발자', '원장 명의', '개인 명의' 등.

create table if not exists public.profile_identities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  kind text not null default 'personal',
  doctor_id uuid references public.doctors(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_identities
  drop constraint if exists profile_identities_handle_format;
alter table public.profile_identities
  add constraint profile_identities_handle_format
    check (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

create index if not exists idx_profile_identities_profile_id
  on public.profile_identities(profile_id);

-- check_handle_not_reserved 갱신: postgres(service role)·admin 호출이면 bypass
-- (관리자가 admin 본인에게 'admin' handle 부여 가능, 외부 가입자는 여전히 trigger로 차단)
create or replace function public.check_handle_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / postgres 호출은 모든 검사 bypass
  if current_user = 'postgres' or current_user = 'service_role' then
    return new;
  end if;
  if new.handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.handle
  ) then
    raise exception '예약된 핸들입니다: %', new.handle;
  end if;
  if new.alt_handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.alt_handle
  ) then
    raise exception '예약된 핸들입니다: %', new.alt_handle;
  end if;
  if new.handle is not null and new.alt_handle is not null
     and new.handle = new.alt_handle then
    raise exception 'handle과 alt_handle은 다른 값이어야 합니다';
  end if;
  if new.handle is not null and exists (
    select 1 from public.profile_identities
     where handle = new.handle and profile_id <> new.id
  ) then
    raise exception '다른 identity에서 사용 중: %', new.handle;
  end if;
  if new.alt_handle is not null and exists (
    select 1 from public.profile_identities
     where handle = new.alt_handle and profile_id <> new.id
  ) then
    raise exception '다른 identity에서 사용 중: %', new.alt_handle;
  end if;
  return new;
end;
$$;

create or replace function public.check_identity_handle_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user = 'postgres' or current_user = 'service_role' then
    return new;
  end if;
  if exists (
    select 1 from public.profiles
     where (handle = new.handle or alt_handle = new.handle)
       and id <> new.profile_id
  ) then
    raise exception '이미 사용 중인 handle: %', new.handle;
  end if;
  if exists (
    select 1 from public.reserved_handles where handle = new.handle
  ) then
    raise exception '예약된 handle: %', new.handle;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_identities_check on public.profile_identities;
create trigger trg_profile_identities_check
  before insert or update of handle on public.profile_identities
  for each row execute function public.check_identity_handle_uniqueness();

-- RLS
alter table public.profile_identities enable row level security;

drop policy if exists profile_identities_public_select on public.profile_identities;
create policy profile_identities_public_select
  on public.profile_identities for select to anon, authenticated
  using (true);

drop policy if exists profile_identities_self_modify on public.profile_identities;
create policy profile_identities_self_modify
  on public.profile_identities for all to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ── 즉시 데이터 변경 ──
-- 1) pibutenten@gmail.com 관리자
update public.profiles
   set display_name = '관리자',
       handle = 'admin'
 where id = 'c0bdb8e6-dedc-4736-bfe1-44675d1a4202';

-- 2) 배정민 (jminbae@gmail.com): primary = 원장 명의
update public.profiles
   set display_name = '배정민',
       handle = 'bae-jungmin'
 where id = '929fc408-ec3b-48d0-b404-d500a606dcaa';

-- 추가 identity 2개
insert into public.profile_identities (profile_id, handle, display_name, kind, is_default)
values
  ('929fc408-ec3b-48d0-b404-d500a606dcaa', 'developer', '개발자', 'developer', false),
  ('929fc408-ec3b-48d0-b404-d500a606dcaa', 'jminbae', '배스킨', 'personal', false)
on conflict (handle) do nothing;
