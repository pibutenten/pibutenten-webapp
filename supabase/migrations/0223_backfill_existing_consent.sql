-- 0223: 기존 회원 동의 백필 (F-1, 결정 1 옵션 B 부속)
--
-- ============================================================================
-- ⚠⚠⚠ 경고: 본 마이그레이션은 기존 회원 데이터를 변경한다 (스키마 추가가 아님).
-- ============================================================================
-- 운영 결정: "이미 약관에 동의한 활성 회원을 현 시점 기준으로 개인정보 동의 완료로
--   간주한다." 이는 0221(컬럼 신설)과 성격이 다르므로 별도 파일로 분리한다.
--   사람이 내용을 확인한 뒤 직접 적용할 것 (자동 적용 금지).
--
-- 대상: terms_agreed_at 이 있고 아직 탈퇴(deleted_at IS NULL) 하지 않은 회원
--   (2026-06-04 기준 47명). 신규 가입자는 SignupForm 에서 약관·개인정보를 동시에
--   기록하므로 백필 대상이 아니다 (privacy_agreed_at 이 이미 채워짐 → WHERE 절에서 제외).
--
-- 동작:
--   - privacy_agreed_at        := now()   (현 시점 동의로 간주)
--   - terms_agreed_version     := '2026-05-28'  (src/lib/consent-versions.ts TERMS_VERSION 과 동일)
--   - privacy_agreed_version   := '2026-05-19'  (src/lib/consent-versions.ts PRIVACY_VERSION 과 동일)
--   ※ marketing/news 동의는 백필하지 않는다 (기존 회원의 선택 동의 의사를 임의 추정 금지).
--   ※ marketing_email_consent_at 도 백데이트 불가 → NULL 유지.
--
-- 멱등: 이미 privacy_agreed_at 이 있는 row 는 제외 (WHERE privacy_agreed_at IS NULL).
--   버전 상수가 바뀌면 이 SQL 의 리터럴도 함께 갱신해야 한다 (consent-versions.ts 가 SSOT).

UPDATE public.profiles
SET
  privacy_agreed_at      = now(),
  terms_agreed_version   = COALESCE(terms_agreed_version, '2026-05-28'),
  privacy_agreed_version = COALESCE(privacy_agreed_version, '2026-05-19')
WHERE terms_agreed_at IS NOT NULL
  AND deleted_at IS NULL
  AND privacy_agreed_at IS NULL;
