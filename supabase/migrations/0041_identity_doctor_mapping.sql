-- =============================================================
-- 0041. profile_identities 원장 매핑 통합 + 정한미·이도영 원장 identity 추가
--
-- 권한 분기는 profile_identities.doctor_id 기반으로 통일:
--   active identity.doctor_id NOT NULL  → 원장 admin (본인 doctor 카드만)
--   active identity.kind='admin'         → super admin (개발자/관리자)
--   active identity.kind='personal'      → 일반 사용자
--
-- doctor_accounts 테이블은 호환성 유지 (deprecated, 동기화만)
-- =============================================================

-- 1) 배정민 jminbae profile의 'bae-jungmin' identity → doctor_id 매핑
update public.profile_identities
   set doctor_id = '7e200da6-617e-4a22-a4aa-5c40a3e1444b',  -- 배정민 doctor
       kind = 'doctor',
       is_default = true
 where profile_id = '929fc408-ec3b-48d0-b404-d500a606dcaa'
   and handle = 'bae-jungmin';

-- 2) 정한미 profile에 'jung-hanmi' 원장 identity 추가 (기존 primary는 'u-4ta852' 개인)
insert into public.profile_identities
  (profile_id, handle, display_name, kind, doctor_id, is_default)
values
  ('4f5096cc-f7b5-4ec4-88cd-2fb63b41653c',
   'jung-hanmi',
   '정한미',
   'doctor',
   '93b30a7c-bd6f-4a98-b7fe-2c169cf07962',
   true)
on conflict (handle) do update
   set doctor_id = excluded.doctor_id,
       kind = excluded.kind,
       is_default = excluded.is_default;

-- 정한미 profile의 기존 'u-4ta852' primary identity는 개인용으로 — kind만 변경
update public.profile_identities
   set kind = 'personal',
       is_default = false
 where profile_id = '4f5096cc-f7b5-4ec4-88cd-2fb63b41653c'
   and handle = 'u-4ta852';

-- 3) 이도영 profile에 'rhee-doyoung' 원장 identity 추가
insert into public.profile_identities
  (profile_id, handle, display_name, kind, doctor_id, is_default)
values
  ('0643743d-e93d-4065-973a-0116a82b4e5a',
   'rhee-doyoung',
   '이도영',
   'doctor',
   '94ad4a71-7b26-484f-b896-323fe9e3b492',
   true)
on conflict (handle) do update
   set doctor_id = excluded.doctor_id,
       kind = excluded.kind,
       is_default = excluded.is_default;

-- 이도영 profile의 기존 'dandygom' identity가 있으면 → personal
update public.profile_identities
   set kind = 'personal',
       is_default = false
 where profile_id = '0643743d-e93d-4065-973a-0116a82b4e5a'
   and handle = 'dandygom';

-- 4) doctor_accounts 와 동기화 (이도영 미매핑 → 추가)
insert into public.doctor_accounts (profile_id, doctor_id)
values
  ('0643743d-e93d-4065-973a-0116a82b4e5a', '94ad4a71-7b26-484f-b896-323fe9e3b492')
on conflict (profile_id) do nothing;

-- 5) jminbae의 'developer' identity는 이미 kind='admin' 인데 한 번 더 확인 + display_name 통일
update public.profile_identities
   set kind = 'admin',
       display_name = '개발자'
 where profile_id = '929fc408-ec3b-48d0-b404-d500a606dcaa'
   and handle = 'developer';

-- 6) pibutenten@gmail.com profile의 'admin' identity (primary) → kind='admin' 으로
update public.profile_identities
   set kind = 'admin',
       is_default = true
 where profile_id = 'c0bdb8e6-dedc-4736-bfe1-44675d1a4202'
   and handle = 'admin';
