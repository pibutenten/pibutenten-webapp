-- 0249. tag_dictionary / term_glossary anon·authenticated SELECT GRANT 보강 (1단계 A)
--
-- 0247/0248 은 RLS enable + SELECT policy 만 추가했고 테이블 레벨 GRANT 를 누락했다.
-- PostgREST(anon REST)는 RLS policy 외에 테이블 GRANT SELECT 도 필요 → 빌드타임 스냅샷
-- 생성기(scripts/gen-tag-dictionary.mjs)의 anon REST 조회가 401(permission denied)로 실패했다.
-- 두 사전은 공개 참조 데이터(PII 없음)이므로 anon/authenticated SELECT 를 허용한다.
-- 멱등(GRANT 재실행 무해).

GRANT SELECT ON public.tag_dictionary TO anon, authenticated;
GRANT SELECT ON public.term_glossary  TO anon, authenticated;
