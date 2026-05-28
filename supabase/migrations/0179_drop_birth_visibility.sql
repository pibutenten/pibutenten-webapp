-- 0179. profiles 정비 ① — birth_visibility 컬럼 DROP
--
-- 배경: 0123 마이그에서 anon REVOKE 명단에만 등장하고 어디서도 사용되지 않음.
--   - 코드 grep 0건
--   - DB 뷰/RPC/RLS/트리거/인덱스 모두 참조 없음
--   - 데이터: 44명 전원 default 'age_range' 그대로 (non-default 0건)
--
-- 0123 의 anon REVOKE 컬럼 명단은 컬럼이 사라지면 자연 무효화되므로 별도 처리 불필요.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_visibility;
