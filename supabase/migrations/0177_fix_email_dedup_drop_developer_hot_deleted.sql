-- 0177. 점검 보고서 후속 정합 fix 3건 (2026-05-28)
--
-- (1) find_duplicate_profiles: 옛 legal_name 시그니처 회귀를 ADR 0003/0111 의 contact_email 기반으로 회복.
--     0134 의 enumeration 차단 (providers 빈 배열) + rate-limit (60s/3회, 24h/30회) 그대로 유지.
--     배경: production 현재 정의가 p_legal_name 인자로 p.legal_name 컬럼 매칭을 시도하나,
--     해당 컬럼은 0110 에서 이미 DROP. 코드는 p_email 키워드로 호출 중이라 dedup 가 silent 실패 상태.
--
-- (2) videos / card_impressions RLS 정책에서 폐기된 'developer' role 매칭 제거.
--     실 데이터 분포: admin 2, doctor 9, user 32 — 'developer' role 인 row 0건 (0050 에서 admin 으로 회수).
--     user_role enum 의 'developer' value 자체는 보존 (DROP TYPE drift 회피).
--
-- (3) get_hot_card_ids: deleted_at IS NULL 가드 추가. ADR 0002 soft-delete 정합 + 0172 다층 방어 패턴 통일.
--     이 함수는 SECURITY DEFINER 라 RLS 의 deleted_at 제약을 우회하므로 함수 본문 명시 가드 필요.

BEGIN;

-- ============================================================
-- (1) find_duplicate_profiles — email 기반으로 회복 (ADR 0003 / 0111)
-- ============================================================
DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);

CREATE OR REPLACE FUNCTION public.find_duplicate_profiles(
  p_email text,
  p_birthdate date,
  p_gender text
)
RETURNS TABLE(match_count integer, providers text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate_minute boolean;
  v_rate_day boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  -- 60초 윈도우: 3회 — 자동화 즉시 차단 (0134 정책 유지)
  v_rate_minute := public.check_and_increment_rate_limit(
    'find_duplicate_profiles_minute:' || v_user_id::text,
    3,
    60
  );
  IF NOT v_rate_minute THEN
    RAISE EXCEPTION 'rate limit exceeded — try again in a minute'
      USING ERRCODE = '54000';
  END IF;

  -- 24시간 윈도우: 30회 — 분산 공격 차단 (0134 정책 유지)
  v_rate_day := public.check_and_increment_rate_limit(
    'find_duplicate_profiles_day:' || v_user_id::text,
    30,
    86400
  );
  IF NOT v_rate_day THEN
    RAISE EXCEPTION 'daily rate limit exceeded'
      USING ERRCODE = '54000';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0
     OR p_birthdate IS NULL OR p_gender IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  -- providers 응답은 항상 빈 배열 (0134 enumeration 방어 유지).
  -- match_count > 0 면 UI 가 "이미 가입한 정보로 보여요" 문구만 표시.
  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::int AS match_count,
    ARRAY[]::text[] AS providers
  FROM public.profiles p
  WHERE lower(p.contact_email) = lower(trim(p_email))
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text) TO authenticated;

-- ============================================================
-- (2) RLS 정책에서 폐기된 'developer' 매칭 제거
-- ============================================================
-- videos: admin insert
DROP POLICY IF EXISTS "videos: admin insert" ON public.videos;
CREATE POLICY "videos: admin insert" ON public.videos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
         AND p.role = 'admin'::user_role
    )
  );

-- videos: admin update
DROP POLICY IF EXISTS "videos: admin update" ON public.videos;
CREATE POLICY "videos: admin update" ON public.videos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
         AND p.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
         AND p.role = 'admin'::user_role
    )
  );

-- card_impressions_admin_select
DROP POLICY IF EXISTS "card_impressions_admin_select" ON public.card_impressions;
CREATE POLICY "card_impressions_admin_select" ON public.card_impressions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
         AND p.role = 'admin'::user_role
    )
  );

-- ============================================================
-- (3) get_hot_card_ids — deleted_at IS NULL 가드 추가
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_hot_card_ids(p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id::bigint
    FROM public.cards c
   WHERE c.status = 'published'::qa_status
     AND c.deleted_at IS NULL  -- ADR 0002 soft-delete 정합 (다층 방어)
     -- 최소 점수 임계값 — 글 발행 직후의 0점 카드 자동 진입 차단
     AND (COALESCE(c.like_count, 0) + COALESCE(c.view_count, 0) / 5) >= 5
   ORDER BY (
     (COALESCE(c.like_count, 0)::float8 + COALESCE(c.view_count, 0)::float8 / 5.0)
     * EXP(-EXTRACT(EPOCH FROM (now() - c.created_at)) / (86400.0 * 30.0))
   ) DESC,
            c.created_at DESC
   LIMIT p_limit;
$function$;

-- PostgREST 스키마 새로 고침
NOTIFY pgrst, 'reload schema';

COMMIT;
