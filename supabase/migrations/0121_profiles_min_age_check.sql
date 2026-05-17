-- 0121: profiles.birthdate 에 만 14세 이상 CHECK 제약 추가 (A3, 2026-05-17)
--
-- 배경:
--   개인정보 보호법상 만 14세 미만 가입은 법정대리인 동의 필수.
--   피부텐텐은 현재 법정대리인 동의 프로세스가 없으므로 14세 미만 가입 자체를 차단.
--   기존 검증은 SignupForm 의 self-attestation 체크박스 1개 + OnboardingClient 의
--   유효성 검사뿐이라 우회 가능 (직접 PATCH /rest/v1/profiles 호출 등).
--
-- 정책:
--   - birthdate IS NULL 은 허용 (탈퇴자 익명화 row + 의사 시스템 계정 등).
--   - birthdate IS NOT NULL 이면 오늘 - 14년 보다 같거나 작아야 함 (= 만 14세 이상).
--
-- 적용 시 주의:
--   기존 row 중 birthdate 가 오늘 - 14년 보다 큰 row (만 14세 미만) 가 있으면 ADD CONSTRAINT 실패.
--   → 사전 점검 쿼리:
--        SELECT id, handle, birthdate
--          FROM public.profiles
--         WHERE birthdate IS NOT NULL
--           AND birthdate > now()::date - interval '14 years';
--   → 기존 row 가 있으면 birthdate 를 NULL 로 비식별화하거나 row 삭제 후 적용.
--
-- NOT VALID 옵션:
--   NOT VALID 로 ADD 하면 기존 row 검증 skip, 신규 INSERT/UPDATE 만 검증.
--   기존 row 정리가 부담스러우면 NOT VALID 로 적용 후 차차 정리.
--   본 마이그레이션은 안전한 default 로 NOT VALID 사용. 적용 후 운영자가
--   기존 row 정리 후 `VALIDATE CONSTRAINT` 로 전체 검증.

BEGIN;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_min_age
  CHECK (
    birthdate IS NULL
    OR birthdate <= (now()::date - interval '14 years')::date
  )
  NOT VALID;

COMMENT ON CONSTRAINT chk_min_age ON public.profiles IS
  '만 14세 미만 가입 차단 (A3, 2026-05-17). NULL 은 허용 (탈퇴 익명화/시스템 계정). 적용 후 VALIDATE CONSTRAINT 로 기존 row 도 검증 권장.';

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- 후속 절차 (수동):
--   1. 사전 점검:
--        SELECT count(*) FROM public.profiles
--         WHERE birthdate > now()::date - interval '14 years';
--   2. count > 0 이면 해당 row 처리 (NULL 비식별화 또는 삭제).
--   3. 검증 활성화:
--        ALTER TABLE public.profiles VALIDATE CONSTRAINT chk_min_age;
-- ────────────────────────────────────────────────────────────────────────
