-- 0141_service_role_grants_hotfix.sql (2026-05-19, 보안 2.5차 핫픽스)
--
-- 0137(content_reports) 와 0140(audit_logs) 에서 service_role 의 INSERT/SELECT/UPDATE/DELETE
-- 권한 GRANT 누락. Supabase service_role 은 자동 superuser 가 아니며 각 테이블별 명시 GRANT 필요.
-- 누락 시 admin client (service_role JWT) 의 PostgREST 호출이 권한 거부됨.
--
-- 발견: preview 서버에서 /api/reports POST 가 save_failed 500 반환. SQL 직접 INSERT 는 성공.
-- information_schema.role_table_grants 조회 결과 service_role 에 INSERT 권한 부재 확인.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.content_reports_id_seq TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO service_role;
