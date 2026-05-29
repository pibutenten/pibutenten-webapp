-- 0190_doctors_profile_data_grant.sql
-- doctors.profile_data UPDATE 권한을 service_role 에 부여 (2026-05-29).
--
-- 배경 (d4ceff8 의 진짜 미해결 원인):
--   d4ceff8 (방식 B) 가 신규 PUT /api/admin/doctors/[slug]/profile 라우트로 통일하고
--   service_role 키 (createSupabaseAdminClient) 로 doctors UPDATE 시도. 그러나
--   production `doctors` 테이블에 service_role 의 SELECT/INSERT/UPDATE/DELETE GRANT
--   가 모두 0 (0001_init 의 누락 패턴). service_role 의 BYPASSRLS=true 는 RLS 만
--   우회하고 PostgreSQL 의 GRANT 권한 체크는 별도라, UPDATE 시도 시 1차에서 즉시
--   42501 permission denied → "저장에 실패했습니다." 토스트.
--
-- 사전 사실 (2026-05-29 production 직접 조회):
--   - admin write 대상 5 테이블 (audit_logs, cards, comments, content_reports,
--     profiles) 모두 service_role 에 SELECT/INSERT/UPDATE/DELETE 전체 부여됨.
--   - doctors 만 service_role 에 SIUD 0개 (REFERENCES/TRIGGER/TRUNCATE 만) — 일관된
--     운영 추세에서 명백한 누락.
--   - 본 라우트가 SELECT 는 server client (authenticated, 기존 GRANT) 로 하고
--     UPDATE 만 admin client (service_role) 로 함 → UPDATE GRANT 만 부여하면 충분.
--   - profile_data 컬럼만 수정 — slug/name/title/clinic 등 식별 컬럼은 보호 유지.
--
-- 부여 범위 (의도된 최소):
--   GRANT UPDATE (profile_data) ON public.doctors TO service_role;
--   - 컬럼 한정 (profile_data) — slug/name 등 식별 컬럼 보호.
--   - service_role 한정 — authenticated 는 그대로 (라우트 가드가 권한 책임).
--   - RLS 정책 추가 없음 — service_role 은 BYPASSRLS 이라 무의미.
--
-- 검증 (end-to-end, 본 트랜잭션 안):
--   사전 + 사후 DO 검증 블록. column_privileges 에 UPDATE 권한 존재 확인.
--
-- 롤백: 0190b_doctors_profile_data_grant_rollback.sql

BEGIN;

-- ─── 사전 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_grant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'doctors'
      AND grantee = 'service_role'
      AND column_name = 'profile_data'
      AND privilege_type = 'UPDATE'
  ) INTO v_has_grant;
  IF v_has_grant THEN
    RAISE NOTICE '[0190 pre] doctors.profile_data UPDATE GRANT 가 service_role 에 이미 존재 (멱등 적용).';
  ELSE
    RAISE NOTICE '[0190 pre] doctors.profile_data UPDATE GRANT 부재 확인. 부여 진행.';
  END IF;
END $$;

-- ─── GRANT 부여 ────────────────────────────────────────────────────────────
GRANT UPDATE (profile_data) ON public.doctors TO service_role;

-- ─── 사후 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_grant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'doctors'
      AND grantee = 'service_role'
      AND column_name = 'profile_data'
      AND privilege_type = 'UPDATE'
  ) INTO v_has_grant;
  IF NOT v_has_grant THEN
    RAISE EXCEPTION '[0190 post] GRANT 적용 실패 — column_privileges 에 UPDATE(profile_data) 부재';
  END IF;
  RAISE NOTICE '[0190 post] GRANT 적용 확인 OK';
END $$;

-- PostgREST 스키마 캐시 reload (GRANT 변경은 PostgREST 가 캐시할 수 있음).
NOTIFY pgrst, 'reload schema';

COMMIT;
