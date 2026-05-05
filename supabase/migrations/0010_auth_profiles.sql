-- =============================================================
-- 0010. 인증·역할 시스템
--
-- 1) user_role enum (admin/doctor/user)
-- 2) profiles 테이블 (auth.users 1:1 확장)
-- 3) doctor_accounts (profile ↔ doctor 매핑)
-- 4) handle_new_user 트리거 (auth.users INSERT → profiles 자동 생성)
-- 5) is_admin / current_doctor_id 헬퍼 함수
-- 6) RLS 정책
-- =============================================================

-- 1. role enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'doctor', 'user');
  end if;
end$$;

-- 2. profiles
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  role                     public.user_role not null default 'user',
  display_name             text,
  avatar_url               text,
  bio                      text,
  marketing_email_consent  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- 3. doctor_accounts
create table if not exists public.doctor_accounts (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  doctor_id   uuid not null unique references public.doctors(id) on delete restrict,
  created_at  timestamptz not null default now()
);

-- 4. handle_new_user 트리거 — auth.users INSERT 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. 헬퍼 함수
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$func$;

create or replace function public.current_doctor_id(uid uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $func$
  select doctor_id from public.doctor_accounts where profile_id = uid;
$func$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.current_doctor_id(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.current_doctor_id(uuid) to anon, authenticated;

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 6. RLS
alter table public.profiles enable row level security;
alter table public.doctor_accounts enable row level security;

-- profiles 정책
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (
    -- 일반 사용자는 role 컬럼 변경 금지 (admin만 가능)
    (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()))
    or public.is_admin()
  );

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete using (public.is_admin());

-- doctor_accounts: admin만 변경, 본인은 본인 매핑 조회 가능
drop policy if exists "doctor_accounts_select" on public.doctor_accounts;
create policy "doctor_accounts_select" on public.doctor_accounts
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists "doctor_accounts_admin_all" on public.doctor_accounts;
create policy "doctor_accounts_admin_all" on public.doctor_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- (참고) qas/doctors RLS는 별도 마이그레이션에서 정리
