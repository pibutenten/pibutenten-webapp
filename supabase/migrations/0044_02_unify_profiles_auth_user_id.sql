-- =============================================================
-- 0044. Phase 9 1단계 — profiles.auth_user_id 컬럼 + role enum에 'developer' 추가
--
-- 안전 단계 (데이터 변경 X):
--   - profiles에 auth_user_id uuid 컬럼 추가 (auth.users.id 참조, NULLABLE)
--   - 기존 row들의 auth_user_id를 본인 id로 백필 (현재 1:1 매핑)
--   - role enum에 'developer' 값 추가
--
-- 이 migration은 스키마 변경만 — 기존 코드 그대로 동작 (auth_user_id는 옵셔널 컬럼)
-- profile_identities 이관·FK 재매핑·admin→developer 변경 등은 0045에서 진행
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. role enum에 'developer' 값 추가
-- ─────────────────────────────────────────────────────────────
-- Postgres enum은 새 값 추가만 가능 (제거·재정렬 불가).
-- profiles.role이 enum 타입이면 ADD VALUE, text면 skip.
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_attribute a on a.atttypid = t.oid
    join pg_class c on c.oid = a.attrelid
    where t.typtype = 'e'
      and c.relname = 'profiles'
      and a.attname = 'role'
  ) then
    -- enum 타입인 경우만 ADD VALUE
    declare
      v_enum_name text;
    begin
      select t.typname into v_enum_name
        from pg_type t
        join pg_attribute a on a.atttypid = t.oid
        join pg_class c on c.oid = a.attrelid
       where c.relname = 'profiles' and a.attname = 'role';
      execute format('alter type public.%I add value if not exists ''developer''', v_enum_name);
      raise notice 'role enum (%) 에 developer 값 추가 완료', v_enum_name;
    end;
  else
    raise notice 'profiles.role이 enum 아님 — text/varchar로 추정, developer 값 추가 skip';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. profiles.auth_user_id 컬럼 추가
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists auth_user_id uuid;

-- FK 추가 (이미 있으면 skip)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_auth_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 인덱스 (auth_user_id 묶음 lookup 빈번)
create index if not exists profiles_auth_user_id_idx
  on public.profiles (auth_user_id);

-- 백필: 현재 profiles.id = auth.users.id 인 row들 (가입한 사용자)
update public.profiles p
   set auth_user_id = p.id
 where p.auth_user_id is null
   and exists (select 1 from auth.users u where u.id = p.id);

comment on column public.profiles.auth_user_id is
  'Phase 9: 같은 사람의 여러 profiles row를 묶는 키. auth.users.id 참조. NULL이면 미가입 (예: 미가입 원장).';

-- ─────────────────────────────────────────────────────────────
-- 검증
-- ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from public.profiles where auth_user_id is not null) as profiles_with_auth_user,
  (select count(*) from public.profiles where auth_user_id is null) as profiles_without_auth_user;
