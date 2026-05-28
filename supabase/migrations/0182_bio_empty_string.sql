-- 0182. profiles 정비 ⑤ — bio NULL → 빈 문자열 통일
--
-- 배경:
--   - 현재: NULL 31명 (70%), "만나서 반갑습니다." 텍스트는 DB 에 0건 (코드 placeholder 일 뿐)
--   - 변경: ALTER DEFAULT '' + 기존 NULL 31명도 빈 문자열로 통일
--   - 이후: bio = '' (미입력) / bio = '실제 자기소개' 2-state. NULL 안 나타남.
--
-- propagate_onboarding_to_doctor_bundle 의 COALESCE(profiles.bio, v_src.bio) 는
-- 빈 문자열을 NOT NULL 로 인식하므로 의사 묶음 동기화 시 빈 bio 가 덮어쓰이지 않음 — 의도된 동작.

-- (1) DEFAULT 변경 (새 INSERT 영향)
ALTER TABLE public.profiles ALTER COLUMN bio SET DEFAULT '';

-- (2) 기존 NULL 일괄 빈 문자열로 UPDATE
UPDATE public.profiles SET bio = '' WHERE bio IS NULL;
