-- 0060: qas.author_id Phase 9 정합성 복구
--
-- 배경: src/app/api/admin/draft/publish/route.ts (이전 버전)에서
--       author_id 에 auth.users.id (= profiles.auth_user_id) 를 넣어 발행함.
--       Phase 9 이후 profiles.id ≠ auth.users.id 인 신규 admin 묶음에서는
--       qas.author_id JOIN profiles 가 매칭 실패 → "(작성자 없음)" 표시.
--
-- 정책:
--   1. author_id 가 auth.users.id (= profiles.auth_user_id) 와 같으면
--      → 같은 그룹 내 첫 profile (보통 admin profile) 로 교체
--   2. author_id 가 NULL 이거나 어떤 profile.id 와도 매칭 안 되면
--      → doctor_id 가 있을 경우 doctor_accounts 로 원장님 profile 찾기
--      → 없으면 그대로 (UI에서는 "(작성자 없음)" 표시 유지)

-- 1. author_id 가 auth.users.id 인 케이스 → 같은 그룹의 admin profile 로 교체
update public.qas q
   set author_id = sub.profile_id
  from (
    select distinct on (p.auth_user_id) p.auth_user_id as auid, p.id as profile_id
      from public.profiles p
     where p.role = 'admin'
     order by p.auth_user_id, p.created_at asc
  ) sub
 where q.author_id = sub.auid
   and not exists (
     select 1 from public.profiles p2 where p2.id = q.author_id
   );

-- 2. author_id 가 NULL/orphan + doctor_id 있는 경우 → doctor의 profile_id 사용
update public.qas q
   set author_id = da.profile_id
  from public.doctor_accounts da
 where q.doctor_id = da.doctor_id
   and (
     q.author_id is null
     or not exists (select 1 from public.profiles p where p.id = q.author_id)
   );

-- 3. 검증 — 남은 orphan 카드 수 (정보 목적)
do $$
declare
  orphan_cnt int;
begin
  select count(*) into orphan_cnt
    from public.qas q
   where q.author_id is null
      or not exists (select 1 from public.profiles p where p.id = q.author_id);
  raise notice '0060: remaining qas with orphan author_id = %', orphan_cnt;
end $$;
