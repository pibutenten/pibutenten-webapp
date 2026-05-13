-- =============================================================
-- 0059. RLS Phase 9 호환 — 묶음(auth_user_id) 인지 정책
--
-- 배경: profile_identities 폐기 후, 한 사용자(auth.uid())가 여러 profiles row를
--       소유할 수 있음. 같은 사용자 = 같은 auth_user_id.
--       기존 RLS는 `auth.uid() = id` 가정이라 부계정 활동이 차단됨.
--
-- 변경 핵심:
--   1. is_admin() / current_doctor_id() — 묶음 기반으로 재정의 (DEFINER)
--   2. same_group_profile_ids() — 같은 묶음 profile.id 목록 헬퍼 (DEFINER)
--   3. profiles / qa_likes / qa_saves / qa_ratings / comments / qas
--      → user_id·author_id가 본인 묶음 안의 profile.id면 통과 (drop & create)
--
-- 안전:
--   - 기존 정책 이름과 동일하게 drop & create → cmd/role/clause만 갱신
--   - public select 정책(`profiles_public_select`, `qas_public_read`, etc.)은
--     건드리지 않음 (외부 노출 조건 동일)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. helper 함수 묶음 기반 재정의
-- ─────────────────────────────────────────────────────────────

-- 본인 묶음 안의 모든 profile.id (자기 자신 포함)
create or replace function public.same_group_profile_ids(uid uuid default auth.uid())
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select id
  from public.profiles
  where uid is not null
    and (id = uid or auth_user_id = uid);
$$;

grant execute on function public.same_group_profile_ids(uuid) to authenticated, anon;

-- admin: 같은 묶음 안에 role='admin' profile이 1개 이상 존재
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profiles
    where role = 'admin'
      and (id = uid or auth_user_id = uid)
  );
$$;

-- doctor: 같은 묶음 안의 profile 중 doctor_accounts 매핑된 doctor_id (첫 1개)
create or replace function public.current_doctor_id(uid uuid default auth.uid())
returns uuid
language sql stable security definer
set search_path to 'public'
as $$
  select da.doctor_id
  from public.doctor_accounts da
  join public.profiles p on p.id = da.profile_id
  where p.id = uid or p.auth_user_id = uid
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. profiles — 묶음 안의 profile은 self select/update
-- ─────────────────────────────────────────────────────────────

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select
  using (
    auth.uid() = id
    or auth_user_id = auth.uid()
    or is_admin()
  );

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update
  using (
    auth.uid() = id
    or auth_user_id = auth.uid()
    or is_admin()
  )
  with check (
    -- 본인 묶음 안의 row만 update 가능. role 변경은 admin만.
    (
      (auth.uid() = id or auth_user_id = auth.uid())
      and role = (select pp.role from public.profiles pp where pp.id = profiles.id)
    )
    or is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 3. qa_likes / qa_saves / qa_ratings — user_id가 묶음 내 profile.id면 통과
-- ─────────────────────────────────────────────────────────────

drop policy if exists qa_likes_insert_own on public.qa_likes;
create policy qa_likes_insert_own on public.qa_likes
  for insert
  with check (user_id in (select public.same_group_profile_ids(auth.uid())));

drop policy if exists qa_likes_delete_own on public.qa_likes;
create policy qa_likes_delete_own on public.qa_likes
  for delete
  using (user_id in (select public.same_group_profile_ids(auth.uid())));

drop policy if exists qa_saves_self_select on public.qa_saves;
create policy qa_saves_self_select on public.qa_saves
  for select
  using (user_id in (select public.same_group_profile_ids(auth.uid())) or is_admin());

drop policy if exists qa_saves_self_insert on public.qa_saves;
create policy qa_saves_self_insert on public.qa_saves
  for insert
  with check (user_id in (select public.same_group_profile_ids(auth.uid())));

drop policy if exists qa_saves_self_delete on public.qa_saves;
create policy qa_saves_self_delete on public.qa_saves
  for delete
  using (user_id in (select public.same_group_profile_ids(auth.uid())));

drop policy if exists qa_ratings_self_modify on public.qa_ratings;
create policy qa_ratings_self_modify on public.qa_ratings
  for all
  using (user_id in (select public.same_group_profile_ids(auth.uid())))
  with check (user_id in (select public.same_group_profile_ids(auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- 4. comments — author_id가 묶음 내 profile.id면 통과
-- ─────────────────────────────────────────────────────────────

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert
  with check (
    auth.uid() is not null
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  );

drop policy if exists comments_update_self on public.comments;
create policy comments_update_self on public.comments
  for update
  using (
    auth.uid() is not null
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  )
  with check (
    auth.uid() is not null
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  );

drop policy if exists comments_delete_self on public.comments;
create policy comments_delete_self on public.comments
  for delete
  using (
    auth.uid() is not null
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- 5. qas — 묶음 내 author_id 본인 글 update/delete 허용 (post type)
-- ─────────────────────────────────────────────────────────────

drop policy if exists qas_user_own_post on public.qas;
create policy qas_user_own_post on public.qas
  for update
  using (
    auth.uid() is not null
    and type = 'post'::qa_type
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  )
  with check (
    auth.uid() is not null
    and type = 'post'::qa_type
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  );

drop policy if exists qas_user_own_post_delete on public.qas;
create policy qas_user_own_post_delete on public.qas
  for delete
  using (
    auth.uid() is not null
    and type = 'post'::qa_type
    and author_id in (select public.same_group_profile_ids(auth.uid()))
  );

drop policy if exists qas_user_post_insert on public.qas;
create policy qas_user_post_insert on public.qas
  for insert
  with check (
    auth.uid() is not null
    and (
      (
        type = 'post'::qa_type
        and author_id in (select public.same_group_profile_ids(auth.uid()))
        and doctor_id is null
      )
      or is_admin()
      or doctor_id = current_doctor_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 6. 검증
-- ─────────────────────────────────────────────────────────────

select
  (select count(*) from pg_policies where schemaname='public' and tablename='profiles')   as profiles_policies,
  (select count(*) from pg_policies where schemaname='public' and tablename='qa_likes')   as qa_likes_policies,
  (select count(*) from pg_policies where schemaname='public' and tablename='qa_saves')   as qa_saves_policies,
  (select count(*) from pg_policies where schemaname='public' and tablename='comments')   as comments_policies,
  (select count(*) from pg_policies where schemaname='public' and tablename='qas')        as qas_policies,
  'OK' as status;
