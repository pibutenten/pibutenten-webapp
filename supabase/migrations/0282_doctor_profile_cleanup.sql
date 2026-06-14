-- Migration: 0282_doctor_profile_cleanup
-- Date: 2026-06-14
-- Purpose: doctors.profile_data (education/career) 정정
--   education: 각 항목 끝 " 수료" 제거
--   career: (a) 현재 힐하우스 소속 항목 제거, (b) 나머지 항목 "전 " 접두 제거
-- Scope: 원장 9명 전원 명시적 UPDATE (일괄 regexp 미사용, 데이터 정확성 우선)
-- Approved by: 원장(사용자) 2026-06-14

-- 1. jung-hanmi (강남점)
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["가톨릭대학교 의과대학 졸업", "가톨릭중앙의료원 인턴 및 피부과 전공의"]'::jsonb
  ),
  '{career}',
  '["가톨릭대학교 성빈센트병원 피부과 임상강사", "후즈후피부과 동탄점 원장"]'::jsonb
)
WHERE slug = 'jung-hanmi';

-- 2. bae-jungmin (강남점)
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["가톨릭대학교 의과대학 졸업", "가톨릭중앙의료원 인턴 및 피부과 전공의", "가톨릭대학교 의과대학 대학원 의학박사"]'::jsonb
  ),
  '{career}',
  '["가톨릭대학교 의과대학 피부과 조교수·부교수", "가톨릭대학교 의과대학 피부과 임상강사·연구계약교원", "연세대학교 의과대학 세브란스병원 피부과 임상강사"]'::jsonb
)
WHERE slug = 'bae-jungmin';

-- 3. kang-hyunjin (건대점) — career가 현소속 1개뿐이므로 제거 후 빈 배열
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["토론토대학교 생명과학 전공", "가톨릭대학교 의과대학 졸업", "가톨릭중앙의료원 인턴 및 피부과 전공의"]'::jsonb
  ),
  '{career}',
  '[]'::jsonb
)
WHERE slug = 'kang-hyunjin';

-- 4. kim-jongsic (판교점)
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["서울대학교 기계항공공학부 졸업", "가톨릭대학교 의과대학 졸업", "가톨릭중앙의료원 피부과 전공의"]'::jsonb
  ),
  '{career}',
  '["새봄피부과 원장"]'::jsonb
)
WHERE slug = 'kim-jongsic';

-- 5. kim-soohyung (수원점) — education에 "수료" 원래 없으므로 education 미변경
UPDATE doctors
SET profile_data = jsonb_set(
  profile_data,
  '{career}',
  '["MJ피부과 원장"]'::jsonb
)
WHERE slug = 'kim-soohyung';

-- 6. ko-hyerim (수원점)
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["가톨릭중앙의료원 인턴 및 피부과 전공의"]'::jsonb
  ),
  '{career}',
  '["오라클피부과 천안신부점 원장"]'::jsonb
)
WHERE slug = 'ko-hyerim';

-- 7. kwon-soohyun (수원점)
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["아주대학교 의과대학 졸업", "아주대학교병원 인턴 및 피부과 전공의", "아주대학교 의과대학 박사과정"]'::jsonb
  ),
  '{career}',
  '["아주대학교병원 임상강사", "닥터스피부과 광교점 원장"]'::jsonb
)
WHERE slug = 'kwon-soohyun';

-- 8. park-hyojin (대구점) — education의 "수련"은 제거 대상 아님("수료"만 제거 규칙)
--   career: 현소속(대구점 대표원장) 제거, "전 힐하우스 수원점"은 과거 이력이므로 "전 " 접두만 제거 유지
UPDATE doctors
SET profile_data = jsonb_set(
  profile_data,
  '{career}',
  '["힐하우스피부과의원 수원점 원장", "더퍼스트피부과 대구점 원장"]'::jsonb
)
WHERE slug = 'park-hyojin';

-- 9. rhee-doyoung (건대점) — "울산대학교 의과대학 피부과 외래교수"는 원본에 "전 " 없으므로 그대로 유지
UPDATE doctors
SET profile_data = jsonb_set(
  jsonb_set(
    profile_data,
    '{education}',
    '["서울대학교 의과대학 졸업", "서울아산병원 피부과 전공의", "서울아산병원 피부과 임상전임강사"]'::jsonb
  ),
  '{career}',
  '["울산대학교 의과대학 피부과 외래교수", "리더스피부과 건대점 대표원장"]'::jsonb
)
WHERE slug = 'rhee-doyoung';
