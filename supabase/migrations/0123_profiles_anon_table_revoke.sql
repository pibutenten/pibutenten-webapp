-- 0123: profiles 의 anon table-level SELECT 회수 후 안전 컬럼만 재부여 (A1 후속, 2026-05-17)
--
-- 배경:
--   0122 가 column-level REVOKE 만 적용했으나, anon 에 이미 table-level GRANT SELECT
--   가 살아있어서 column-level REVOKE 가 사실상 no-op 이었음 (PostgreSQL 동작).
--   information_schema.column_privileges 확인 결과 PII 8개 컬럼 모두 SELECT 여전히 존재.
--
-- 해결:
--   1. anon 에 대한 table-level SELECT 회수.
--   2. 안전 컬럼만 명시적으로 column-level GRANT.
--   → anon 이 PII 컬럼을 select 하면 permission denied.
--
-- 영향:
--   anon 은 더 이상 `SELECT * FROM profiles` 불가. 명시적 컬럼 select 만 가능.
--   서버 코드 (`[handle]/page.tsx`) 는 0122 후속으로 viewer 분기 select 적용 완료.
--   authenticated 는 영향 없음 (별도 GRANT 유지).

BEGIN;

-- 1) anon 에서 table-level SELECT 회수.
REVOKE SELECT ON public.profiles FROM anon;

-- 2) 안전 컬럼만 명시적 GRANT.
--    PII 제외: birthdate, birth_date, gender, face_shape, skin_type, skin_concerns,
--             interested_procedures, liked_procedures, contact_email
--    플래그성(누설 영향 미미): birth_visibility, field_visibility, marketing_email_consent
--    그 외 일반: id, role, display_name, avatar_url, bio, created_at, updated_at,
--             terms_agreed_at, age_confirmed_at, level, activity_score, is_public,
--             handle, doctor_id, auth_user_id, deleted_at
GRANT SELECT (
  id, role, display_name, avatar_url, bio, marketing_email_consent,
  created_at, updated_at, terms_agreed_at, age_confirmed_at,
  birth_visibility, level, activity_score, is_public,
  handle, field_visibility, doctor_id, auth_user_id, deleted_at
) ON public.profiles TO anon;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- 검증:
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'profiles'
--      AND privilege_type = 'SELECT'
--    ORDER BY column_name;
--   → PII 8개 컬럼이 결과에 없어야 함.
-- ────────────────────────────────────────────────────────────────────────
