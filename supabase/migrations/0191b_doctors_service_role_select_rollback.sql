-- 0191b_doctors_service_role_select_rollback.sql
-- 0191 의 정확한 역방향. service_role 의 doctors SELECT 권한 회수.
-- 롤백 후 admin client UPDATE WHERE id 시도는 다시 42501 (SELECT 권한 부재) 로 차단.

BEGIN;

REVOKE SELECT ON public.doctors FROM service_role;

DO $$
DECLARE v_has_select boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name='doctors'
      AND grantee='service_role' AND privilege_type='SELECT'
  ) INTO v_has_select;
  IF v_has_select THEN
    RAISE EXCEPTION '[0191b rollback] REVOKE 실패 — SELECT 잔재';
  END IF;
  RAISE NOTICE '[0191b rollback] REVOKE 확인 OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
