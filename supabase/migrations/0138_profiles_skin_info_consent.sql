-- 0138_profiles_skin_info_consent.sql (2026-05-19, 보안 2.5차 C묶음)
--
-- 온보딩에서 피부 정보(피부타입·고민·관심시술) 활용에 대한 명시 동의 시점 기록.
-- PIPA 권고: 동의 이력 보존. 컬럼 NULL 이면 미동의, 값 있으면 그 시점에 동의.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skin_info_consent_at timestamptz;

COMMENT ON COLUMN public.profiles.skin_info_consent_at IS
  '온보딩에서 입력한 피부 정보의 피드 추천·서비스 개선 활용 동의 시점 (보안 2.5차)';
