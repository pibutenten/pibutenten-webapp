-- 0130: doctor_accounts 매핑 정정 — 어제 0127 묶음 작업 누락 보완 (2026-05-18)
--
-- 배경:
--   `doctor_accounts.profile_id` 는 **doctor profile** 을 가리켜야 함 (관리 화면 칩 표시 +
--   active identity 로 doctor 전환 시 `getDoctorIdForProfile` 매핑). 기존 6쌍은 모두
--   doctor profile 을 가리킴.
--
--   어제 0127 묶음 작업 시 doctor_accounts 는 같이 손보지 않아 다음 회귀 발생:
--     - @kim-soohyung: doctor_accounts.profile_id 가 @drksh0415(user) 로 잘못 들어감
--       → admin/users 화면 "🩺 김수형" 칩이 user 옆에 뜸
--     - @park-hyojin, @kang-hyunjin: doctor_accounts 매핑 자체가 없음
--       → 칩 미표시 + doctor 권한 매핑 불가
--
-- fix:
--   1) 김수형: profile_id 를 doctor 프로필(@kim-soohyung) 로 UPDATE
--   2) 박효진: doctor 프로필(@park-hyojin) 로 INSERT
--   3) 강현진: doctor 프로필(@kang-hyunjin) 로 INSERT

BEGIN;

-- 1) 김수형
UPDATE public.doctor_accounts
SET profile_id = '38cff24a-8f2d-47a1-af0a-76dbcba2ba73'  -- @kim-soohyung doctor profile
WHERE doctor_id = (SELECT id FROM public.doctors WHERE slug = 'kim-soohyung');

-- 2) 박효진
INSERT INTO public.doctor_accounts (profile_id, doctor_id)
SELECT 'e20b9ed8-e035-4260-a06f-d703e2a5f05b', d.id
FROM public.doctors d
WHERE d.slug = 'park-hyojin'
  AND NOT EXISTS (SELECT 1 FROM public.doctor_accounts da WHERE da.doctor_id = d.id);

-- 3) 강현진
INSERT INTO public.doctor_accounts (profile_id, doctor_id)
SELECT '830c22aa-855b-4110-88f9-d801a0c873d3', d.id
FROM public.doctors d
WHERE d.slug = 'kang-hyunjin'
  AND NOT EXISTS (SELECT 1 FROM public.doctor_accounts da WHERE da.doctor_id = d.id);

-- 검증: 7개 매핑 → 9개. 모두 doctor profile (role='doctor') 가리켜야 함.
SELECT count(*) AS total_mappings,
  count(*) FILTER (WHERE p.role = 'doctor') AS pointing_to_doctor,
  count(*) FILTER (WHERE p.role <> 'doctor') AS pointing_to_non_doctor
FROM public.doctor_accounts da
JOIN public.profiles p ON p.id = da.profile_id;

COMMIT;
