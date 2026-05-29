-- 0191_doctors_service_role_select.sql
-- doctors 의 service_role SELECT 권한 추가 — 0190 의 후속 (UPDATE WHERE 절 평가용).
--
-- 배경 (0190 end-to-end 실증에서 발견):
--   0190 가 `GRANT UPDATE (profile_data) ON public.doctors TO service_role` 적용했고
--   column_privileges 에 UPDATE 등록도 확인됐으나, end-to-end 실증
--   (`SET LOCAL role service_role; UPDATE doctors SET profile_data = $1 WHERE id = $2`)
--   에서 여전히 42501 permission denied 발생. HINT 가 정확히
--   `GRANT SELECT ON public.doctors TO service_role;` 을 요구.
--
--   원인 — PostgreSQL Privileges 정확 모델:
--   > UPDATE: Permission to use SELECT on this table is also needed to refer to the
--   > column values in the right-hand side of the SET expressions, and in the
--   > WHERE clause.
--
--   라우트 쿼리:
--     UPDATE public.doctors SET profile_data = $1 WHERE id = $2;
--     - SET RHS 는 직접 값 → SELECT 불필요
--     - WHERE id 는 컬럼 참조 → id 컬럼 SELECT 권한 필요
--
--   0001_init 의 일관된 누락 — admin write 5 테이블 (audit_logs/cards/comments/
--   content_reports/profiles) 은 모두 service_role 에 SELECT 부여됐는데 doctors
--   만 SELECT/INSERT/UPDATE/DELETE 전부 누락. 0190 가 UPDATE 만 채웠고 본 0191
--   가 SELECT 마저 채워 admin write 패턴의 일관된 미충족 종결.
--
-- 부여 범위:
--   GRANT SELECT ON public.doctors TO service_role;
--   - 전체 컬럼 SELECT — doctors 는 이미 `doctors: public read` (USING true) RLS 라
--     anon/authenticated 도 전체 컬럼 SELECT 가능. service_role 에 부여해도 외부
--     노출 변화 0.
--   - INSERT/DELETE 는 부여 안 함 — 의사 신규 생성/삭제는 본 admin client 경로 아님
--     (사용자 운영 SQL 직접 수행). 최소 표면 유지.
--
-- 검증 (end-to-end):
--   본 마이그 적용 후 별도 SQL 실증:
--     BEGIN;
--     SET LOCAL role service_role;
--     UPDATE public.doctors SET profile_data = profile_data WHERE id = $1;
--     ROLLBACK;
--   → ROW(S) AFFECTED 반환 (이전엔 42501). 데이터 무변경.
--
-- 롤백: 0191b_doctors_service_role_select_rollback.sql

BEGIN;

-- ─── 사전 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_select boolean;
  v_has_update boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name='doctors'
      AND grantee='service_role' AND privilege_type='SELECT'
  ) INTO v_has_select;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='doctors'
      AND grantee='service_role' AND column_name='profile_data'
      AND privilege_type='UPDATE'
  ) INTO v_has_update;
  RAISE NOTICE '[0191 pre] service_role SELECT(doctors)=% / UPDATE(profile_data)=%',
    v_has_select, v_has_update;
  IF NOT v_has_update THEN
    RAISE EXCEPTION '[0191 pre] 0190 의 UPDATE(profile_data) 부재 — 0190 적용 후 본 마이그 실행 필요';
  END IF;
END $$;

-- ─── GRANT 부여 ────────────────────────────────────────────────────────────
GRANT SELECT ON public.doctors TO service_role;

-- ─── 사후 검증 ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_select boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name='doctors'
      AND grantee='service_role' AND privilege_type='SELECT'
  ) INTO v_has_select;
  IF NOT v_has_select THEN
    RAISE EXCEPTION '[0191 post] GRANT SELECT 적용 실패';
  END IF;
  RAISE NOTICE '[0191 post] SELECT GRANT 적용 확인 OK';
END $$;

-- PostgREST 스키마 캐시 reload (GRANT 변경 캐시 무효화).
NOTIFY pgrst, 'reload schema';

COMMIT;
