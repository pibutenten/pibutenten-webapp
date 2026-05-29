-- 0190b_doctors_profile_data_grant_rollback.sql
-- 0190 의 정확한 역방향. service_role 의 doctors.profile_data UPDATE 권한 회수.
-- 롤백 후 admin client UPDATE 시도는 다시 42501 permission denied 로 차단됨.

BEGIN;

REVOKE UPDATE (profile_data) ON public.doctors FROM service_role;

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
    RAISE EXCEPTION '[0190b rollback] REVOKE 실패 — UPDATE GRANT 잔재';
  END IF;
  RAISE NOTICE '[0190b rollback] REVOKE 적용 확인 OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
