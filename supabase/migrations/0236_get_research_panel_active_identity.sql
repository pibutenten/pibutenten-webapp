-- 0236_get_research_panel_active_identity.sql
-- 2026-06-05 — get_research_panel() 을 명함(profiles.id) 단위 집계로 정렬 (ADR 0012).
--
-- 배경:
--   0224 의 get_research_panel() 은 COALESCE(auth_user_id, id) 로 같은 auth user 의
--   여러 명함(profile)을 1명으로 합산하는 "번들 롤업" 이었다. 이는 ADR 0012
--   (명함/active identity 단위 집계) 와 어긋난다. 다명함 사용자(주로 원장)가
--   1명으로 접혀 total_members 가 실제 명함 수보다 작게 나온다.
--
-- 변경:
--   COALESCE 번들 롤업 제거 → profiles.id distinct 카운트로 교체.
--   - total_members : 비탈퇴 profile row 수 (명함 단위)
--   - active_90d    : 90일 내 site_visits 가 있는 비탈퇴 명함 수 (DISTINCT profile_id)
--   - reviewers     : procedure_reviews 작성한 비탈퇴 명함 수 (DISTINCT author_id)
--
-- 불변:
--   반환 시그니처(total_members, active_90d, reviewers) 동일. SECURITY DEFINER 유지.
--   ACL 은 CREATE OR REPLACE 가 보존(0224 의 PUBLIC + authenticated 그대로). 기존 0224 파일 미수정.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_research_panel()
RETURNS TABLE(total_members integer, active_90d integer, reviewers integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    (SELECT count(*)::int
       FROM profiles
      WHERE deleted_at IS NULL),
    (SELECT count(DISTINCT sv.profile_id)::int
       FROM site_visits sv
       JOIN profiles p ON p.id = sv.profile_id
      WHERE p.deleted_at IS NULL
        AND sv.created_at >= now() - interval '90 days'),
    (SELECT count(DISTINCT r.author_id)::int
       FROM procedure_reviews r
       JOIN profiles p ON p.id = r.author_id
      WHERE p.deleted_at IS NULL);
$function$;

-- idempotent (ACL 보존; 0224 의 authenticated EXECUTE 재확인)
GRANT EXECUTE ON FUNCTION public.get_research_panel() TO authenticated;

COMMIT;

SELECT 'OK 0236' AS status;
