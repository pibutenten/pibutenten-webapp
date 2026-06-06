-- 0252. tag_dictionary / tag_review_queue / term_glossary service_role CRUD GRANT 보강 (2단계 버그 0)
--
-- 증상: /admin/tags 인라인 [저장] 시 "저장에 실패했어요" (save_failed).
-- 원인: PATCH /api/admin/tag-dictionary/[id] 는 service_role(admin client)로 UPDATE 한다.
--   service_role 은 BYPASSRLS 라 RLS policy 는 통과하지만, 테이블 레벨 GRANT 는 별개다.
--   0247/0248 은 authenticated 에 CRUD, anon 에 SELECT 만 명시 GRANT 했고 service_role 을
--   누락 → PostgREST 가 SET ROLE service_role 후 UPDATE 시 42501 permission denied.
--   (0249 가 같은 누락을 anon/authenticated SELECT 에 대해 보강했으나 service_role 은 또 누락.)
-- 검증: service_role REST PATCH 재현 시 42501 → 본 GRANT 후 정상 200.
--
-- procedure_taxonomy 도 동일 누락(service_role SELECT 없음) — 태그 rename API(#2)가 시술 태그
--   충돌 체크로 service_role SELECT 하므로 함께 보강. (시술 태그는 tag_dictionary 와
--   procedure_taxonomy 에 동일 ko 로 중복 저장 49/49, procedure_reviews FK 는 후자를 참조.)
-- 멱등(GRANT 재실행 무해). id 는 GENERATED ALWAYS AS IDENTITY 라 시퀀스 별도 GRANT 불요.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_dictionary    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_review_queue  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.term_glossary     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_taxonomy TO service_role;
