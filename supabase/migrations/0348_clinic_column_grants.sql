-- 0348_clinic_column_grants.sql
-- 병원 계정 · 시술노트 대행 — 3인 코드검수 치명 2건 정정: 신규 컬럼 GRANT 보강 (2026-07-05)
--
-- 배경: 0335 가 profiles 의 authenticated SELECT 를 컬럼단위 화이트리스트(23컬럼)로 재부여,
--   0190 이 doctors 의 service_role UPDATE 를 profile_data 컬럼 1개로 한정했다. 0341/0342 가
--   신규 컬럼을 추가하면서 이 컬럼단위 GRANT 를 확장하지 않아, 코드가 신규 컬럼을 건드리는 순간
--   42501(permission denied)이 발생한다.
--
--   [치명 C1] resolveActiveIdentity(identity-server.ts) 가 profiles.clinic_id 를 SELECT →
--     authenticated 에 clinic_id SELECT 권한 없음 → data=null → 전 로그인 유저 401(사이트 마비).
--     clinic_id 는 비-PII(건보 지점 코드 참조)라 SELECT 부여 안전. legal_name 은 PII 라 부여 안 함(차단 유지).
--   [치명 C2] admin settings 라우트가 service_role 로 doctors.clinic_id/is_affiliated/is_listed/
--     branch/slug UPDATE → service_role 에 profile_data 외 UPDATE 권한 없음 → 42501.
--
-- 부수(검수 정합): 0347 anonymize GRANT EXECUTE 재명시(관례 통일), 0344 시퀀스 방어적 REVOKE.

BEGIN;

-- C1: profiles.clinic_id — authenticated SELECT 부여(비-PII). legal_name 은 부여하지 않음(PII 차단 유지).
GRANT SELECT (clinic_id) ON public.profiles TO authenticated;

-- C2: doctors 운영 설정 컬럼 — service_role UPDATE 부여(admin settings 라우트가 service_role 로 write).
GRANT UPDATE (clinic_id, is_affiliated, is_listed, branch, slug) ON public.doctors TO service_role;

-- 0347 anonymize 관례 통일(선행 anonymize 교체 마이그는 CREATE OR REPLACE 시 GRANT 재명시).
GRANT EXECUTE ON FUNCTION public.anonymize_user_content_before_delete() TO authenticated;

-- 0344 clinic_member_links 시퀀스 방어적 REVOKE(RPC=owner 권한 INSERT, 직접 접근 차단 완결).
REVOKE ALL ON SEQUENCE public.clinic_member_links_id_seq FROM anon, authenticated;

COMMIT;
