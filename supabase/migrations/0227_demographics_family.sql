-- 0227: get_procedure_review_demographics — family 롤업 (작업 D-b)
--
-- live(2026-06-04) 정의 VERBATIM + WHERE 절의 procedure_ko 매칭만 family 로 확장.
--   pr.procedure_ko = p_procedure_ko  →  = ANY(public.procedure_family(p_procedure_ko))
-- 나머지(집계·시그니처·STABLE·SECURITY DEFINER·search_path) 불변.

CREATE OR REPLACE FUNCTION public.get_procedure_review_demographics(p_procedure_ko text)
 RETURNS TABLE(male integer, female integer, other_gender integer, age_u20 integer, age_20s integer, age_30s integer, age_40s integer, age_50p integer, age_unknown integer, total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH r AS (
    SELECT
      p.gender,
      CASE WHEN p.birthdate IS NULL THEN NULL
           ELSE extract(year from age(p.birthdate))::int END AS yrs
    FROM public.procedure_reviews pr
    JOIN public.cards c ON c.id = pr.card_id
    JOIN public.profiles p ON p.id = pr.author_id
    WHERE pr.procedure_ko = ANY(public.procedure_family(p_procedure_ko))
      AND c.status = 'published'
      AND c.deleted_at IS NULL
  )
  SELECT
    count(*) FILTER (WHERE gender = 'male')::int,
    count(*) FILTER (WHERE gender = 'female')::int,
    count(*) FILTER (WHERE gender IS NULL OR gender NOT IN ('male','female'))::int,
    count(*) FILTER (WHERE yrs IS NOT NULL AND yrs < 20)::int,
    count(*) FILTER (WHERE yrs BETWEEN 20 AND 29)::int,
    count(*) FILTER (WHERE yrs BETWEEN 30 AND 39)::int,
    count(*) FILTER (WHERE yrs BETWEEN 40 AND 49)::int,
    count(*) FILTER (WHERE yrs >= 50)::int,
    count(*) FILTER (WHERE yrs IS NULL)::int,
    count(*)::int
  FROM r;
$function$;
