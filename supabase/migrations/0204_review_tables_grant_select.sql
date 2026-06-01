-- 0204: 후기 테이블 SELECT 권한 부여 (P3 결함 수정)
--
-- 결함: 0199/0200 에서 RLS 정책만 만들고 anon/authenticated 테이블 GRANT 누락 →
--   로그인 사용자 세션(authenticated 역할)이 procedure_taxonomy 를 못 읽어
--   /review/new 의 시술 목록이 빈 결과("선택할 수 있는 시술이 없습니다")였음.
--   Management API(postgres) 검증은 권한을 우회해 이 결함을 못 잡았음.
-- 행 접근은 기존 RLS 정책이 계속 통제(taxonomy=공개, reviews=공개카드+본인). 쓰기는 service_role/RPC.

GRANT SELECT ON public.procedure_taxonomy TO anon, authenticated;
GRANT SELECT ON public.procedure_reviews  TO anon, authenticated;
