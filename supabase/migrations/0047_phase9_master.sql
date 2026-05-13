-- =============================================================
-- 0047. Phase 9 마스터 — FK 정비 + profile_identities → profiles 이관
--
-- 사전: 0044(profiles.auth_user_id), 0045(시도 후 롤백), 0046(videos write)
--       이 마이그레이션은 0045를 대체. 보다 안전하게 단계화.
--
-- 전략:
--   A) auth.users 가리키는 FK 모두 제거 (uuid 컬럼은 그대로, FK 제약만 해제)
--   B) profile_identities → profiles INSERT (id 재사용)
--   C) author_id/user_id 등을 identity_id 값으로 UPDATE
--      → 이 시점부터 user_id 단독으로 ID 분리 동작
--   D) admin → developer
--   E) profile_identities 데이터·테이블 폐기는 0048에서 (코드 변경 후)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- A. auth.users 가리키는 FK 모두 제거
-- ─────────────────────────────────────────────────────────────
do $$
declare
  c record;
  -- 제거 대상 FK 목록
  drop_targets text[] := array[
    'profiles_id_fkey',
    'comments_author_id_fkey',
    'comment_likes_user_id_fkey',
    'qa_likes_user_id_fkey',
    'qa_saves_user_id_fkey',
    'qa_ratings_user_id_fkey',
    'qas_author_id_fkey'  -- qas는 author_id_profiles_fkey도 있어서 그건 유지
  ];
  t text;
begin
  foreach t in array drop_targets loop
    for c in
      select cl.relname as src_table, cn.conname
      from pg_constraint cn
      join pg_class cl on cl.oid = cn.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cn.conname = t
    loop
      execute format('alter table public.%I drop constraint %I', c.src_table, c.conname);
      raise notice '[0047 A] DROP FK %.%', c.src_table, c.conname;
    end loop;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- B. profile_identities → profiles 이관 (id 재사용)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_count int;
begin
  insert into public.profiles (
    id,
    handle,
    display_name,
    avatar_url,
    bio,
    role,
    auth_user_id,
    created_at,
    updated_at
  )
  select
    pi.id,
    pi.handle,
    pi.display_name,
    pi.avatar_url,
    pi.bio,
    (case
      when pi.kind = 'admin' then 'developer'
      when pi.kind = 'doctor' then 'doctor'
      else 'user'
    end)::user_role,
    pi.profile_id,                  -- 묶음 키 — 가입자면 본인 auth user id, 미가입이면 NULL
    coalesce(pi.created_at, now()),
    coalesce(pi.updated_at, now())
  from public.profile_identities pi
  where not exists (
    select 1 from public.profiles p
     where p.id = pi.id or p.handle = pi.handle
  );
  get diagnostics v_count = row_count;
  raise notice '[0047 B] profile_identities → profiles: % row INSERT', v_count;
end $$;

-- ─────────────────────────────────────────────────────────────
-- C. doctor_accounts 보존 — 새로 INSERT된 doctor row에 매핑 추가
-- ─────────────────────────────────────────────────────────────
insert into public.doctor_accounts (profile_id, doctor_id)
select p.id, pi.doctor_id
  from public.profile_identities pi
  join public.profiles p on p.id = pi.id
 where pi.doctor_id is not null
   and not exists (
     select 1 from public.doctor_accounts da
     where da.profile_id = p.id and da.doctor_id = pi.doctor_id
   );

-- ─────────────────────────────────────────────────────────────
-- D. author_id·user_id 등을 identity_id 값으로 UPDATE
--    → user_id 단독으로 ID 분리 자동 동작
-- ─────────────────────────────────────────────────────────────

-- D-1. qas.author_id ← author_identity_id (있으면)
update public.qas q
   set author_id = q.author_identity_id
 where q.author_identity_id is not null
   and q.author_id <> q.author_identity_id
   and exists (select 1 from public.profiles p where p.id = q.author_identity_id);

-- D-2. comments.author_id ← identity_id (있으면)
update public.comments c
   set author_id = c.identity_id
 where c.identity_id is not null
   and c.author_id <> c.identity_id
   and exists (select 1 from public.profiles p where p.id = c.identity_id);

-- D-3. qa_likes.user_id ← identity_id (있으면)
update public.qa_likes ql
   set user_id = ql.identity_id
 where ql.identity_id is not null
   and ql.user_id <> ql.identity_id
   and exists (select 1 from public.profiles p where p.id = ql.identity_id);

-- D-4. qa_saves.user_id ← identity_id (컬럼 있는 경우만)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'qa_saves' and column_name = 'identity_id'
  ) then
    execute $upd$
      update public.qa_saves qs
         set user_id = qs.identity_id
       where qs.identity_id is not null
         and qs.user_id <> qs.identity_id
         and exists (select 1 from public.profiles p where p.id = qs.identity_id)
    $upd$;
  end if;
end $$;

-- D-5. comment_likes.user_id ← identity_id (컬럼 있는 경우만)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comment_likes' and column_name = 'identity_id'
  ) then
    execute $upd$
      update public.comment_likes cl
         set user_id = cl.identity_id
       where cl.identity_id is not null
         and cl.user_id <> cl.identity_id
         and exists (select 1 from public.profiles p where p.id = cl.identity_id)
    $upd$;
  end if;
end $$;

-- D-6. notifications도 동일 패턴 (actor_id/recipient_id ← *_identity_id)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'actor_identity_id'
  ) then
    execute $upd$
      update public.notifications n
         set actor_id = n.actor_identity_id
       where n.actor_identity_id is not null
         and n.actor_id <> n.actor_identity_id
         and exists (select 1 from public.profiles p where p.id = n.actor_identity_id)
    $upd$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_identity_id'
  ) then
    execute $upd$
      update public.notifications n
         set recipient_id = n.recipient_identity_id
       where n.recipient_identity_id is not null
         and n.recipient_id <> n.recipient_identity_id
         and exists (select 1 from public.profiles p where p.id = n.recipient_identity_id)
    $upd$;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- E. profiles.role 'admin' → 'developer'
-- ─────────────────────────────────────────────────────────────
update public.profiles
   set role = 'developer'::user_role
 where role::text = 'admin';

-- ─────────────────────────────────────────────────────────────
-- F. qa_likes·qa_saves PK 재구성 — (identity_id, qa_id) → (qa_id, user_id)
--    D 단계에서 user_id ← identity_id로 복사했으므로 unique 유지됨.
-- ─────────────────────────────────────────────────────────────

-- F-1. qa_likes PK 재구성
alter table public.qa_likes drop constraint if exists qa_likes_pkey;
alter table public.qa_likes add constraint qa_likes_pkey primary key (qa_id, user_id);

-- F-2. qa_saves PK 재구성
alter table public.qa_saves drop constraint if exists qa_saves_pkey;
alter table public.qa_saves add constraint qa_saves_pkey primary key (qa_id, user_id);

-- F-3. identity_id NOT NULL 제거 — 이제 user_id로 unique 유지됨
alter table public.qa_likes alter column identity_id drop not null;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'qa_saves'
      and column_name = 'identity_id' and is_nullable = 'NO'
  ) then
    execute 'alter table public.qa_saves alter column identity_id drop not null';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 검증
-- ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from public.profiles where role = 'developer'::user_role) as developers,
  (select count(*) from public.profiles where role = 'doctor'::user_role) as doctors,
  (select count(*) from public.profiles where role = 'user'::user_role) as users,
  (select count(*) from public.profile_identities) as profile_identities_legacy,
  (select count(*) from public.profiles where auth_user_id is null) as profiles_without_auth_user;
