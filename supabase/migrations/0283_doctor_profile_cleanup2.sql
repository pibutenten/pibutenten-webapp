-- Migration: 0283_doctor_profile_cleanup2
-- Date: 2026-06-14
-- Purpose: doctors.profile_data 2차 정정 (0282 후속)
--   1. park-hyojin education[2] 끝 " 수련" 제거 (전공의 표기 통일)
--   2. park-hyojin career[1] 힐하우스 직위(" 원장") 제거 → "힐하우스피부과의원 수원점"
--      park-hyojin career[2] 더퍼스트(비힐하우스) → 직위 그대로 유지
--   3. kang-hyunjin career 빈 배열 → ["힐하우스피부과의원 수원점"] 과거 경력 추가
--   4. 규칙 4 재점검: 나머지 7명의 career 힐하우스 항목 없음 → 변경 없음
-- Scope: park-hyojin, kang-hyunjin 2명만 UPDATE
-- Approved by: 원장(사용자) 2026-06-14

-- 1. park-hyojin (대구점)
--    education: 수련 제거, career: 힐하우스 직위 제거 + 더퍼스트 직위 유지
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["계명대학교 의과대학 졸업", "서울성모병원·부천성모병원 피부과 전공의"]'::jsonb
  ),
  '{career}',
  '["힐하우스피부과의원 수원점", "더퍼스트피부과 대구점 원장"]'::jsonb
)
WHERE slug = 'park-hyojin';

-- 2. kang-hyunjin (건대점)
--    career 빈 배열 → 수원점 과거 경력 추가
UPDATE doctors
SET profile_data = jsonb_set(
  profile_data,
  '{career}',
  '["힐하우스피부과의원 수원점"]'::jsonb
)
WHERE slug = 'kang-hyunjin';
