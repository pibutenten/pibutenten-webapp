-- 0212: 시술 리포트용 작성자 인구통계 집계 RPC (개인정보 비노출)
--
-- 시술 리포트 페이지에 작성자 남녀 비율·연령대 비율을 보여주되, 개별 PII(성별·생년월일)는
-- 절대 노출하지 않는다. SECURITY DEFINER 로 profiles 를 서버 권한으로 읽되 **집계 카운트만** 반환.
-- 발행(published)·미삭제 후기의 작성자만 대상. anon/authenticated 모두 호출 가능(집계뿐).

CREATE OR REPLACE FUNCTION public.get_procedure_review_demographics(p_procedure_ko text)
 RETURNS TABLE(
   male int, female int, other_gender int,
   age_u20 int, age_20s int, age_30s int, age_40s int, age_50p int, age_unknown int,
   total int
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 STABLE
AS $function$
  WITH r AS (
    SELECT
      p.gender,
      CASE WHEN p.birthdate IS NULL THEN NULL
           ELSE extract(year from age(p.birthdate))::int END AS yrs
    FROM public.procedure_reviews pr
    JOIN public.cards c ON c.id = pr.card_id
    JOIN public.profiles p ON p.id = pr.author_id
    WHERE pr.procedure_ko = p_procedure_ko
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

GRANT EXECUTE ON FUNCTION public.get_procedure_review_demographics(text) TO anon, authenticated;
