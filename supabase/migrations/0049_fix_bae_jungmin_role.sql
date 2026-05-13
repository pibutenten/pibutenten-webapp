-- =============================================================
-- 0049. bae-jungmin role 정정 — developer → doctor
--
-- 배경: 0047 마이그레이션에서 'admin' role을 일괄 'developer'로 변환했는데,
--       배정민의 primary profile(handle=bae-jungmin)은 실제로는 doctor가
--       맞음 (doctor_accounts에 매핑됨). admin 권한은 별도 ID
--       (handle=developer)가 담당.
--
-- 규칙: doctor_accounts에 매핑된 profiles는 role='doctor'로 통일.
-- =============================================================

-- doctor_accounts에 매핑된 모든 profiles는 role='doctor'로 정정
update public.profiles p
   set role = 'doctor'::user_role
  from public.doctor_accounts da
 where da.profile_id = p.id
   and p.role <> 'doctor'::user_role;

-- 검증
select p.handle, p.display_name, p.role::text as role,
       (case when exists (select 1 from public.doctor_accounts da where da.profile_id = p.id)
             then 'doctor_account 있음' else '없음' end) as doctor_mapping
from public.profiles p
where p.handle in ('bae-jungmin', 'developer', 'jminbae', 'jung-hanmi', 'rhee-doyoung', 'admin')
order by p.handle;
