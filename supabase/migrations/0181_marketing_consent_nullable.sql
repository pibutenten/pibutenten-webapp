-- 0181. profiles 정비 ⑥ — marketing_email_consent 3-state 화
--
-- 배경 (정통망법):
--   - 현재: NOT NULL DEFAULT false → "동의 안 함" 과 "명시 거부" 가 모두 false 로 합쳐짐
--   - 변경 후: NULL (선택 안 함/미입력) / false (명시 거부) / true (동의)
--
-- 데이터 변경 절대 금지 — 스키마만 변경.
--   - 기존 true 20명, false 24명 그대로 유지
--   - 향후 신규 가입자가 체크박스 미응답 시 NULL 로 저장 (signup 폼에서 명시 처리 필요 시 별도 작업)

ALTER TABLE public.profiles ALTER COLUMN marketing_email_consent DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN marketing_email_consent DROP DEFAULT;
