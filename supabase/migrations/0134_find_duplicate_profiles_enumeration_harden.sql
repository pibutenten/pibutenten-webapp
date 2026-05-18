-- 0134: find_duplicate_profiles — enumeration 방지 보강 (PR-A E5)
--
-- 배경 (2026-05-19):
--   현재 함수는 (legal_name, birthdate, gender) 조합으로 매칭 후 (match_count, providers[]) 반환.
--   공격자가 임의 조합 무차별 시도 시 매칭 가입 채널까지 노출되는 사이드 채널 가능.
--   1차 점검 B11 (장기) 항목을 PR-A 에서 흡수.
--
-- 보강 (가벼움 우선):
--   1) Rate-limit 강화: 60초 10회 → 60초 3회 + 24시간 30회 이중 윈도우.
--      정상 가입자는 1~2회 호출로 충분하므로 UX 영향 없음.
--   2) providers 응답 항상 빈 배열로 — match_count > 0 만 클라이언트에 전달.
--      UI 는 이미 빈 배열 fallback ("소셜 로그인" 문구) 처리되어 있어 코드 변경 X.
--
-- 검토 시점에 외부 변호사·KISA 가이드라인 확인 후 더 엄격하게 할지 결정 가능.

DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);

CREATE FUNCTION public.find_duplicate_profiles(
  p_legal_name text,
  p_birthdate date,
  p_gender text
)
RETURNS TABLE(match_count int, providers text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate_minute boolean;
  v_rate_day boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  -- 60초 윈도우: 3회 — 자동화 즉시 차단
  v_rate_minute := public.check_and_increment_rate_limit(
    'find_duplicate_profiles_minute:' || v_user_id::text,
    3,
    60
  );
  IF NOT v_rate_minute THEN
    RAISE EXCEPTION 'rate limit exceeded — try again in a minute'
      USING ERRCODE = '54000';
  END IF;

  -- 24시간 윈도우: 30회 — 분산 공격 차단
  v_rate_day := public.check_and_increment_rate_limit(
    'find_duplicate_profiles_day:' || v_user_id::text,
    30,
    86400
  );
  IF NOT v_rate_day THEN
    RAISE EXCEPTION 'daily rate limit exceeded'
      USING ERRCODE = '54000';
  END IF;

  IF p_legal_name IS NULL OR length(trim(p_legal_name)) = 0
     OR p_birthdate IS NULL OR p_gender IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  -- providers 응답은 항상 빈 배열로 (enumeration 방어).
  -- match_count > 0 면 UI 가 "이미 가입한 정보로 보여요" 문구만 표시.
  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::int AS match_count,
    ARRAY[]::text[] AS providers
  FROM public.profiles p
  WHERE p.legal_name = trim(p_legal_name)
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_profiles(text, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text)
  TO authenticated;

COMMENT ON FUNCTION public.find_duplicate_profiles(text, date, text) IS
  '[0134, PR-A E5] dedup 매칭 RPC. providers 응답은 enumeration 방어 위해 빈 배열 고정. '
  'rate-limit 분당 3회 + 일일 30회 이중 윈도우. 정상 가입자 UX 영향 없음.';
