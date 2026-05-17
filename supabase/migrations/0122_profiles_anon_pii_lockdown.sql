-- 0122: profiles 의료 PII 컬럼을 anon 으로부터 차단 (A1, 2026-05-17)
--
-- 배경:
--   profiles 테이블에 RLS 정책 `profiles_public_select` 가 USING(true) 로 적용되어 있어
--   비로그인(anon) 사용자가 PostgREST 로 `birthdate / gender / face_shape / skin_type /
--   skin_concerns / interested_procedures / liked_procedures / contact_email` 같은
--   의료/개인 민감 정보를 무제한 조회 가능. 개인정보 보호법 민감정보 무단공개 위험.
--
-- 정책 (사용자 결정 2026-05-17):
--   - anon: 위 PII 컬럼 SELECT 자체를 차단 (column-level REVOKE).
--   - authenticated: 기존 RLS + 코드 단 field_visibility 로직 유지 (다른 회원 PII 는
--     본인이 공개로 설정한 경우만 노출). 본인/묶음/admin 은 `profiles_self_select` RLS 로 풀 접근.
--   - 비회원이 PII 항목 클릭 시 회원가입/로그인 모달로 자연 전환 → 앱 코드 [handle]/page.tsx + ProfileTabs 가 분기.
--
-- 동작 메커니즘:
--   PostgreSQL 의 column-level GRANT 는 RLS 와 독립적. anon 이 `SELECT birthdate ...`
--   를 호출하면 RLS 통과 여부와 무관하게 `permission denied for column birthdate` 에러.
--   따라서 anon 호출 코드는 PII 컬럼을 select 목록에서 제외해야 함 (위에서 언급한 코드 변경).
--
-- 미적용 컬럼 (anon 에게 계속 허용):
--   id, auth_user_id, handle, display_name, avatar_url, bio, level, activity_score,
--   is_public, field_visibility, role, deleted_at, created_at, updated_at,
--   terms_agreed_at, age_confirmed_at.
--
-- 부수 검증:
--   적용 후 다음 쿼리가 permission denied 로 떨어지는지 확인 (anon 헤더로 호출):
--     curl -H "apikey: <ANON_KEY>" \
--       "https://<project>.supabase.co/rest/v1/profiles?select=birthdate&limit=1"
--   → 401/permission denied 정상.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) anon 으로부터 PII 컬럼 SELECT 회수
-- ─────────────────────────────────────────────────────────────────
REVOKE SELECT (birthdate) ON public.profiles FROM anon;
REVOKE SELECT (gender) ON public.profiles FROM anon;
REVOKE SELECT (face_shape) ON public.profiles FROM anon;
REVOKE SELECT (skin_type) ON public.profiles FROM anon;
REVOKE SELECT (skin_concerns) ON public.profiles FROM anon;
REVOKE SELECT (interested_procedures) ON public.profiles FROM anon;
REVOKE SELECT (liked_procedures) ON public.profiles FROM anon;
REVOKE SELECT (contact_email) ON public.profiles FROM anon;

-- ─────────────────────────────────────────────────────────────────
-- 2) 안전한 컬럼만 노출하는 view — anon 코드가 명시적으로 이 view 만 쓰면 안전.
--    (선택) 기존 `profiles` 직접 쿼리 코드는 select 컬럼을 줄이는 방식으로도 호환.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_profiles_view
WITH (security_invoker = on)
AS
SELECT
  id,
  auth_user_id,
  handle,
  display_name,
  avatar_url,
  bio,
  level,
  activity_score,
  is_public,
  field_visibility,
  role,
  deleted_at,
  created_at,
  updated_at
FROM public.profiles
WHERE deleted_at IS NULL;

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;

COMMENT ON VIEW public.public_profiles_view IS
  'Anon-safe profiles 뷰 — 의료 PII 컬럼 제외. [handle]/page.tsx 가 viewer null 일 때 사용 권장.';

-- ─────────────────────────────────────────────────────────────────
-- 3) 검증 헬퍼 — 운영자 점검용
-- ─────────────────────────────────────────────────────────────────
-- 다음 쿼리로 anon 의 컬럼 권한을 점검:
--   SELECT column_name, privilege_type
--     FROM information_schema.column_privileges
--    WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'profiles'
--    ORDER BY column_name;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- 후속 작업 (앱 코드):
--   1. src/app/[handle]/page.tsx — viewer 가 null 이면 select 목록에서 PII 컬럼 제외.
--   2. src/components/ProfileTabs.tsx — 비로그인일 때 skinInfo 영역에 "🔒 로그인 후 보기"
--      placeholder + 회원가입/로그인 CTA.
--   3. 다른 곳에서 anon 사용자에게 profiles.skin_* 등을 노출하는 경로가 있다면 동일 패치.
-- ────────────────────────────────────────────────────────────────────────
