-- 0224: 관리자 대시보드 '리서치 패널' 집계 RPC (F-2B)
--
-- 대시보드에 사람(번들) 기준 3수치를 보여주기 위한 read-only 집계 RPC.
--   - 집계만 반환(개별 PII 없음). get_admin_kpi / get_procedure_review_demographics 와 동일 패턴
--     (SECURITY DEFINER + GRANT authenticated). 페이지는 admin 가드로 보호됨.
--
-- 사람 기준 = COALESCE(auth_user_id, id) (= 묶음 키). 의사 멀티 명함 중복 집계 방지.
--   null_auth=0 확인됨(2026-06-04). COALESCE 는 legacy base row(auth_user_id NULL) 견고성용.
-- 탈퇴 제외 = deleted_at IS NULL.
-- 활성 신호 = site_visits(미들웨어 1일 1회 방문 기록). 최근 90일 고정.
--   ※ site_visits 는 2026-05-23 부터 적재 → 90일 윈도 미충전(자연 충전). 로직은 90일 고정.

CREATE OR REPLACE FUNCTION public.get_research_panel()
 RETURNS TABLE(
   total_members int,   -- 총 가입자 (탈퇴 제외, 사람 기준)
   active_90d int,      -- 최근 90일 방문한 회원 (사람 기준)
   reviewers int        -- 후기(procedure_reviews) 작성 회원 (사람 기준)
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  WITH ppl AS (
    SELECT id, COALESCE(auth_user_id, id) AS person, deleted_at
    FROM profiles
  )
  SELECT
    (SELECT count(DISTINCT person)::int FROM ppl WHERE deleted_at IS NULL),
    (SELECT count(DISTINCT p.person)::int
       FROM site_visits sv
       JOIN ppl p ON p.id = sv.profile_id
      WHERE p.deleted_at IS NULL
        AND sv.created_at >= now() - interval '90 days'),
    (SELECT count(DISTINCT p.person)::int
       FROM procedure_reviews r
       JOIN ppl p ON p.id = r.author_id
      WHERE p.deleted_at IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_research_panel() TO authenticated;
