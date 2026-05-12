-- =============================================================
-- 0043. profile_identities.profile_id nullable — owner 없는 identity 허용
--
-- 사용 케이스: 미가입 원장 — admin이 doctors 테이블에 9명 등록했고
-- 그 중 6명은 아직 본인 가입 X. 그 6명도 doctor identity는 미리 있어야 함.
-- (그래야 회원관리·검수·발행 흐름에서 그 원장으로 동작 가능)
--
-- 본인 가입 시 admin이 "이 회원을 ○○ 원장과 연결" 액션 →
-- profile_identities.profile_id를 그 회원 profile.id로 update.
-- =============================================================

alter table public.profile_identities
  alter column profile_id drop not null;

-- 미가입 원장 6명 — doctor identity row 자동 생성
-- (이미 가입된 정한미·이도영·배정민은 skip)
insert into public.profile_identities (handle, display_name, kind, doctor_id, is_default)
select d.slug, d.name, 'doctor', d.id, true
  from public.doctors d
 where not exists (
   select 1 from public.profile_identities pi
    where pi.doctor_id = d.id and pi.kind = 'doctor'
 )
on conflict (handle) do nothing;

-- 검증
select pi.handle, pi.display_name, pi.kind, pi.profile_id is null as is_unowned
  from public.profile_identities pi
 where pi.kind = 'doctor'
 order by pi.display_name;
