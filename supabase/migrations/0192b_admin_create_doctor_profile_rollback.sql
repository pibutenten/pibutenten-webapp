-- 0192b_admin_create_doctor_profile_rollback.sql
-- 0192 롤백: admin_create_doctor_profile RPC 제거.
--
-- 주의: 이 함수가 이미 생성한 doctors/profiles row 는 자동 삭제되지 않는다
--   (데이터 보존). 함수 정의만 제거한다.

DROP FUNCTION IF EXISTS public.admin_create_doctor_profile(uuid, text, text, text, text, text);
