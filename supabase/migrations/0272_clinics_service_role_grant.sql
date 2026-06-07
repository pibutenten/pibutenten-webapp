-- 0272. clinics 테이블 service_role DML GRANT 보정
--
-- 배경: 0270_create_clinics.sql 이 "service_role 은 superuser 수준으로 별도 GRANT 불필요"
--   라고 가정하고 service_role 에 명시적 GRANT 를 하지 않았다. 그러나 Supabase 의
--   service_role 은 PostgREST(REST) 경로로 테이블에 접근할 때 **테이블 수준 GRANT** 가
--   필요하다. 그 결과 관리자 sync(/api/admin/clinics/sync, scripts/sync-clinics.mjs)의
--   service_role upsert 가 "permission denied for table clinics" 로 실패했다.
--   (information_schema 확인: clinics 의 service_role 은 REFERENCES/TRIGGER/TRUNCATE 만
--    보유, INSERT/UPDATE/SELECT/DELETE 누락. 정상 테이블 cards 는 7종 전체 보유.)
--
-- 조치: 다른 테이블과 동일하게 service_role 에 전체 DML 권한 부여.
--   RLS 는 service_role 에 영향 없음(bypass). anon/authenticated 의 SELECT-only 정책은
--   0270 그대로 유지 — 쓰기는 여전히 service_role 전용.
-- 주의: 순수 additive GRANT. 데이터·정책·구조 변경 없음. DROP/REVOKE 없음.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO service_role;

-- 시퀀스(bigserial id)도 service_role 이 insert 시 nextval 호출하므로 권한 보정.
GRANT USAGE, SELECT ON SEQUENCE public.clinics_id_seq TO service_role;
