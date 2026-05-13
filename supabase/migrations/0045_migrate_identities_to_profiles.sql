-- =============================================================
-- 0045. Phase 9 2단계 — profile_identities → profiles 이관
--
-- 0044에서 profiles.auth_user_id 컬럼 추가했음. 이제 데이터 이관:
--   1) profile_identities row마다 profiles 새 row INSERT
--   2) auth_user_id = profile_identities.profile_id (같은 사람 묶음)
--   3) kind → role 매핑 (admin → developer, doctor → doctor, user → user)
--   4) doctor_accounts 매핑 보존
--   5) qas·comments·qa_likes 등 FK 재배선 (identity_id → 새 profiles.id)
--
-- 안전 장치:
--   - 기존 profile_identities row의 id 값은 새 profiles row의 id로 재사용
--     → 기존 author_identity_id·identity_id가 가리키던 row가 새 profiles로 그대로 매칭됨
--   - profile_identities 테이블·관련 컬럼은 폐기하지 않음 (0046에서 코드 변경 후)
--
-- 적용 전 확인: 0044가 적용되어 있어야 함 (profiles.auth_user_id 존재)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. profile_identities → profiles 이관
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
    pi.id,                      -- profile_identities.id 재사용 → 기존 FK 그대로 통함
    pi.handle,
    pi.display_name,
    pi.avatar_url,
    pi.bio,
    case
      when pi.kind = 'admin' then 'developer'
      when pi.kind = 'doctor' then 'doctor'
      else 'user'
    end,
    pi.profile_id,              -- 가입자면 본인 auth.users.id, 미가입(NULL)이면 NULL
    coalesce(pi.created_at, now()),
    coalesce(pi.updated_at, now())
  from public.profile_identities pi
  where not exists (
    select 1 from public.profiles p where p.id = pi.id
  );
  get diagnostics v_count = row_count;
  raise notice '[0045] profile_identities → profiles: % row INSERT', v_count;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. doctor_accounts 보존 — 새로 INSERT된 doctor profiles에 매핑 추가
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
-- 3. qas·comments·qa_likes·qa_saves·comment_likes FK 재배선
--    → author_id·user_id를 새 profiles row로 (identity_id가 가리키던 row의 id 그대로)
-- ─────────────────────────────────────────────────────────────

-- 3-A. qas.author_id ← author_identity_id (있으면 우선)
update public.qas q
   set author_id = q.author_identity_id
 where q.author_identity_id is not null
   and q.author_id <> q.author_identity_id
   and exists (select 1 from public.profiles p where p.id = q.author_identity_id);

-- 3-B. comments.author_id ← identity_id (있으면 우선)
update public.comments c
   set author_id = c.identity_id
 where c.identity_id is not null
   and c.author_id <> c.identity_id
   and exists (select 1 from public.profiles p where p.id = c.identity_id);

-- 3-C. qa_likes.user_id ← identity_id (있으면 우선)
update public.qa_likes ql
   set user_id = ql.identity_id
 where ql.identity_id is not null
   and ql.user_id <> ql.identity_id
   and exists (select 1 from public.profiles p where p.id = ql.identity_id);

-- 3-D. qa_saves.user_id ← identity_id (컬럼 있는 경우만)
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

-- 3-E. comment_likes.user_id ← identity_id (컬럼 있는 경우만)
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

-- ─────────────────────────────────────────────────────────────
-- 4. 기존 profiles.role = 'admin' → 'developer'
--    (단, kind='admin' 부계정은 이미 이관 시 developer로 INSERT됨)
-- ─────────────────────────────────────────────────────────────
update public.profiles
   set role = 'developer'
 where role = 'admin';

-- ─────────────────────────────────────────────────────────────
-- 검증
-- ─────────────────────────────────────────────────────────────

-- 5-A. 이관 누락 체크
do $$
declare v_missing int;
begin
  select count(*) into v_missing
    from public.profile_identities pi
   where not exists (select 1 from public.profiles p where p.id = pi.id);
  if v_missing > 0 then
    raise exception '[0045] 이관 누락 profile_identities: % row', v_missing;
  end if;
  raise notice '[0045] 검증 통과: 모든 profile_identities가 profiles에 존재';
end $$;

-- 5-B. FK orphan 체크
do $$
declare v_orphan int;
begin
  select count(*) into v_orphan
    from public.qas q
   where q.author_id is not null
     and not exists (select 1 from public.profiles p where p.id = q.author_id);
  if v_orphan > 0 then
    raise warning '[0045] qas.author_id orphan: % row', v_orphan;
  end if;
end $$;

-- 결과 요약
select
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from public.profiles where role = 'developer') as developers,
  (select count(*) from public.profiles where role = 'doctor') as doctors,
  (select count(*) from public.profiles where role = 'user') as users,
  (select count(*) from public.profile_identities) as profile_identities_legacy,
  (select count(*) from public.profiles where auth_user_id is null) as profiles_without_auth_user;
