-- 0225: procedure_family(ko) — 시술 롤업 family 헬퍼 (작업 D)
--
-- 부모 리포트 = 자기 + 직속 하위, 하위 = 자기만. 집계 3경로(getProcedureReport·
-- get_procedure_review_demographics·get_review_summary_pool)가 재사용하는 단일 SSOT.
--   procedure_family('보톡스') = ['보톡스', 나보타, …, jaw-botox 등 자식]
--   procedure_family('코어톡스') = ['코어톡스']  (자식 없음 → 자기만)
-- 0206 피드/검색 JOIN 은 개별 유지 → 이 함수 사용 안 함.

CREATE OR REPLACE FUNCTION public.procedure_family(p_ko text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY[p_ko] || COALESCE(
    (SELECT array_agg(ko)
       FROM public.procedure_taxonomy
      WHERE parent_ko = p_ko AND active),
    ARRAY[]::text[]
  );
$function$;

GRANT EXECUTE ON FUNCTION public.procedure_family(text) TO anon, authenticated;
