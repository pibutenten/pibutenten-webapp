-- 0221: 회원 동의 구조 개편 (F-1) — 신규 동의 컬럼 + 동의 문서 버전 컬럼
--
-- 향후 익명·집계 데이터 활용을 위해 가입 동의 구조를 분리·기록한다.
--   - 약관 / 개인정보 동의를 별도 컬럼으로 분리 (기존 terms_agreed_at 유지 + privacy_agreed_at 신설)
--   - 선택 동의 2종(news / marketing) 의 동의 시각 기록
--   - 동의한 문서 버전을 문자열로 기록 (SSOT: src/lib/consent-versions.ts)
--
-- 기존 데이터 변경 없음 (스키마만 추가). marketing_email_consent(3-state, 0181) 불변.
-- news_email_consent 도 marketing 과 동일하게 3-state(NULL/false/true) — DEFAULT 없음.
--   NULL = 미질문(기존 row), false = 명시 거부, true = 동의. (결정 2: default false 폐기)
-- 기존 회원 백필(privacy_agreed_at 등)은 0223 에서 별도 처리 (데이터 변경 → 분리·경고).

-- 1) 개인정보 수집·이용 동의 시각 (필수 동의, 약관과 분리)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz;

-- 2) 새 콘텐츠·업데이트 소식 수신 (선택) — 3-state, DEFAULT 없음
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS news_email_consent boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS news_email_consent_at timestamptz;

-- 3) 마케팅 동의 시각 (marketing_email_consent 컬럼 자체는 불변)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_email_consent_at timestamptz;

-- 4) 동의 문서 버전 문자열 (코드 상수와 동일 값 저장 — 동의 시점의 문서 버전 보존)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_agreed_version text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_agreed_version text;
