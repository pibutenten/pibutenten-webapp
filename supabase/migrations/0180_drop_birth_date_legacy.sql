-- 0180. profiles 정비 ② — 옛 birth_date 컬럼 DROP (현행 birthdate 와 별개)
--
-- 배경:
--   - birth_date: 데이터 0% (한 번도 채워진 적 없음)
--   - 현재 사용되는 컬럼은 birthdate (77.3% 채워짐, 온보딩에서 수집)
--   - 옛 컬럼 잔재이며 admin/users/[id] 의 SELECT/표시줄과 error-response.ts mask 키만 코드 참조
--   - DB 의존 객체 (뷰/RPC/RLS/트리거/인덱스) 0건
--
-- 같은 PR 에서 함께 처리:
--   - admin/users/[id]/page.tsx: 타입 line 29, SELECT line 123, 표시 line 422~423
--   - error-response.ts:86 mask 키 화이트리스트

ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_date;
