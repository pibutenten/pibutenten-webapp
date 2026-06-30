-- 0323_onboarding_fitzpatrick.sql
-- 온보딩 개편(I-Fix4): 피부 광반응(피츠패트릭) 1~6 단계 신규 질문 추가.
--   - profiles.fitzpatrick smallint, CHECK 1~6 (NULL 허용 — 기존 row 미응답).
--   - 온보딩 필수 질문이나 기존 가입자 backfill 없이 NULL 유지(다음 설정 진입 시 입력).
--   - 피드 추천·시술 매칭에서 피부톤 대역 보정 용도(소비는 후속 단계).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fitzpatrick smallint
  CHECK (fitzpatrick IS NULL OR fitzpatrick BETWEEN 1 AND 6);

COMMENT ON COLUMN public.profiles.fitzpatrick IS
  'Fitzpatrick skin phototype 1-6 (onboarding I-Fix4). NULL = not answered.';
