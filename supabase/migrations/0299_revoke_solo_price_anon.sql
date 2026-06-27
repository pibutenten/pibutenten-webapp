-- 0299_revoke_solo_price_anon.sql
-- (0298 은 병행 FOLLOW 세션의 encoding_repair 가 선점 → 본 파일 0299 로 재번호)
-- 원장 결정 F2(가격 영구 비공개)를 DB 권한으로 강제 — solo_price 봉쇄.
--
-- 배경:
--   procedure_reviews.solo_price(0292 추가) 는 read_public(anon SELECT) RLS 경로상
--   is_public=true 인 공개 후기 행에서 anon 에게 직접 노출 가능했다(라이브 재현 확인:
--   SET LOCAL ROLE anon; SELECT solo_price ... WHERE is_public → 성공). 현재 660 공개행 중
--   solo_price 비-NULL 0건이라 실제 유출 데이터는 없으나, F2 를 '컨벤션'이 아닌 '권한'으로
--   막기 위해 컬럼레벨 화이트리스트로 봉쇄한다.
--
-- ★PostgreSQL 동작 주의(0123 profiles 선례 계승):
--   anon 은 procedure_reviews 에 대해 *table-level* SELECT 를 보유(relacl: anon=r.../postgres).
--   table-level GRANT 는 모든 컬럼을 묵시적으로 포함하므로, 단순
--   `REVOKE SELECT (solo_price) ... FROM anon` 은 no-op 이다(컬럼별 ACL 항목이 없어 회수할
--   대상이 없음). 따라서 0123(profiles)과 동일하게:
--     1) anon 의 table-level SELECT 회수
--     2) solo_price 를 제외한 나머지 21개 컬럼만 column-level 재부여
--   → anon 이 solo_price 를 SELECT 목록에 넣으면 permission denied. 그 외 컬럼·기존 코드 무영향.
--
-- 동작 메커니즘:
--   column-level GRANT 는 RLS 와 독립. read_public RLS(행 게이트)는 그대로 유지되며,
--   anon 은 화이트리스트 21컬럼만 읽을 수 있다(행 필터는 read_public 이 계속 통제).
--
-- 안전성(사전조사 결론):
--   - 앱코드(src/**) 전역에 solo_price 참조 0건, procedure_reviews 에 대한 select('*') 0건.
--     모든 직접 select 는 명시 컬럼(satisfaction/pain/revisit/effect_areas/procedure_ko/
--     downtime/effect_onset/procedure_ko/card_id 등) → 화이트리스트에 모두 포함.
--   - 정렬 RPC feed_cards_scored / search_cards_scored 는 SECURITY INVOKER 이나 내부
--     LEFT JOIN procedure_reviews 에서 solo_price 를 참조하지 않음 → 무영향.
--   - 집계 RPC(get_procedure_review_demographics / get_review_summary_pool / procedure_family)
--     도 solo_price 미참조.
--   → 컬럼 화이트리스트만으로 충분(앱코드 변경 불필요).
--
-- 유지:
--   - authenticated: solo_price 포함 전체 SELECT 유지(본인 후기 read_own·일기 가격 경로).
--   - service_role / postgres: 무변경.
--   - anon 의 그 외 21개 컬럼 SELECT 유지(satisfaction/pain/revisit/effect_areas/procedure_ko 등).

BEGIN;

-- 1) anon 의 table-level SELECT 회수(묵시적 전컬럼 허용 제거).
REVOKE SELECT ON public.procedure_reviews FROM anon;

-- 2) solo_price 를 제외한 21개 컬럼만 column-level 재부여.
GRANT SELECT (
  id, card_id, procedure_ko, author_id, satisfaction, pain, area,
  cost_satisfaction, effect_areas, created_at, updated_at, revisit,
  oneliner_type, downtime, effect_onset, recommend, visit_id,
  diary_procedure_id, is_public, date_precision, source
) ON public.procedure_reviews TO anon;

COMMIT;

-- 검증(운영자 점검용):
--   SELECT has_column_privilege('anon','public.procedure_reviews','solo_price','SELECT');  -- false 기대
--   SET LOCAL ROLE anon; SELECT solo_price FROM public.procedure_reviews LIMIT 1;          -- permission denied 기대
--   SET LOCAL ROLE anon; SELECT id, satisfaction FROM public.procedure_reviews WHERE is_public LIMIT 1;  -- 정상 기대
