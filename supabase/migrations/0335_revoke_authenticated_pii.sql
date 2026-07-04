-- 0335_revoke_authenticated_pii.sql
-- Phase 1-B 단계2 / H-1 (2026-07-04): authenticated 롤의 profiles PII 8컬럼 SELECT 차단.
--
-- 배경: authenticated 롤이 profiles 에 (1) 테이블 레벨 SELECT + (2) 31개 컬럼 레벨 SELECT
--   를 모두 갖고 있고, profiles_public_select(qual=true)가 전 행을 통과시켜, 로그인한 아무
--   회원이나 raw REST 로 birthdate·contact_email·피부정보 등 타인 민감 PII 를 수집할 수
--   있었다(field_visibility 는 앱 계층에서만 적용 = 우회 가능, H-1).
--
-- 조치: authenticated 의 SELECT 를 전부 회수한 뒤, 안전(비-PII) 23컬럼만 컬럼 레벨로 재부여.
--   결과적으로 authenticated 는 안전 23컬럼만 읽고 PII 8컬럼(birthdate/contact_email/gender/
--   face_shape/skin_type/skin_concerns/interested_procedures/fitzpatrick)은 차단된다.
--   anon 은 0122/0325 로 이미 차단됨(무변경).
--
--   ⚠ 주의: `REVOKE SELECT ON <table>` 은 테이블 레벨뿐 아니라 **컬럼 레벨 SELECT 까지 전부**
--     회수한다(PostgreSQL 동작). 따라서 "테이블 회수 + PII 컬럼만 회수" 로는 안전컬럼까지
--     막힌다 → 반드시 전체 회수 후 안전컬럼 재부여(GRANT) 패턴을 쓴다.
--
-- 전제 (단계1, 마이그 0334 + commit 4cfcf03 배포·검증 완료): 본인/관리자/타인 PII 조회를
--   전부 SECURITY DEFINER RPC(get_profile_pii/get_onboarding_gate) 또는 service_role admin
--   클라이언트로 이관 완료. 앱의 authenticated 경로는 안전 23컬럼만 직접 SELECT 한다
--   (전수 grep·코드검수·`select("*")` 부재 확인). 따라서 본 REVOKE 후에도 앱 기능 무회귀.
--
-- 적용 후 실측 검증: authenticated SELECT birthdate/contact_email → 42501 차단,
--   handle/display_name/role → 정상, get_profile_pii RPC(SECURITY DEFINER) → 작동, 컬럼 23개.
--
-- 되돌리기(회귀 발생 시): GRANT SELECT ON public.profiles TO authenticated; (전 컬럼 복구)

-- (1) authenticated 의 profiles SELECT 전부 회수 (테이블+컬럼 레벨 모두).
REVOKE SELECT ON public.profiles FROM authenticated;

-- (2) 안전(비-PII) 23컬럼만 컬럼 레벨 SELECT 재부여. PII 8컬럼은 제외 → 차단 유지.
GRANT SELECT (
  id,
  role,
  display_name,
  avatar_url,
  bio,
  marketing_email_consent,
  created_at,
  updated_at,
  terms_agreed_at,
  level,
  activity_score,
  handle,
  field_visibility,
  doctor_id,
  auth_user_id,
  deleted_at,
  skin_info_consent_at,
  privacy_agreed_at,
  news_email_consent,
  news_email_consent_at,
  marketing_email_consent_at,
  terms_agreed_version,
  privacy_agreed_version
) ON public.profiles TO authenticated;
