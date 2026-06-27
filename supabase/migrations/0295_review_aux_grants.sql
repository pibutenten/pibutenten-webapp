-- 0295_review_aux_grants.sql
-- 보정: 0293 신규 4테이블에 테이블레벨 GRANT SELECT 누락 → SELECT RLS 정책이 inert.
-- 0293 의 *_select_own / question_pool_read_active 정책이 실제 동작하도록 SELECT 권한만 부여.
-- 쓰기(INSERT/UPDATE/DELETE)는 SECURITY DEFINER RPC 전용 → grant 추가 금지.
-- service_role 은 RLS 우회 + 이미 전체 권한 → 무변경. anon 은 owner 측정원본 읽기 불가 유지.
-- 기준: 기존 procedure_reviews 의 grant 패턴(authenticated/anon SELECT) 참고.

BEGIN;

-- (A) 측정 원본 3종 — 로그인 단위 owner-only SELECT 정책(authenticated). anon 미부여.
GRANT SELECT ON public.review_checkin          TO authenticated;
GRANT SELECT ON public.review_symptom          TO authenticated;
GRANT SELECT ON public.short_answer_response   TO authenticated;

-- (B) question_pool — 운영 마스터. 정책 question_pool_read_active 가 anon, authenticated
--     양쪽 대상(is_active=true) → 두 role 모두 SELECT 부여.
GRANT SELECT ON public.question_pool           TO anon, authenticated;

COMMIT;
