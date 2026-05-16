-- 0098: 중복 가입자 식별용 legal_name 컬럼 + dedup 검사 RPC
--
-- 정책 (2026-05-16): 본인인증(PASS 등) 대신 약식 dedup.
--   온보딩 시 이름·생년월일·성별을 받음 → 같은 조합이 이미 있으면 "이미 가입하셨나요?" 다이얼로그.
--   legal_name 은 다른 곳에 표시되지 않고 dedup 목적으로만 사용. is_public 무관.
--
-- 모델:
--   - legal_name: 본인 인증용 실명 (display_name 과는 별개)
--   - find_duplicate_profiles(name, birthdate, gender) RPC: 본인 묶음 제외 같은 조합 검색

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_name text;

COMMENT ON COLUMN public.profiles.legal_name IS
  '중복 가입자 식별용 실명 (display_name 과 별개, 다른 곳 미표시). 온보딩 시 수집.';

-- (name, birthdate, gender) 복합 조회용 인덱스
CREATE INDEX IF NOT EXISTS profiles_dedup_idx
  ON public.profiles (legal_name, birthdate, gender)
  WHERE legal_name IS NOT NULL;

-- ── dedup 검사 RPC ──
-- 같은 (legal_name, birthdate, gender) 조합의 다른 사용자(auth_user_id 다름) profile 검색.
-- 본인 묶음의 부계정은 정상 multi-profile 이므로 제외.
DROP FUNCTION IF EXISTS public.find_duplicate_profiles(text, date, text);
CREATE OR REPLACE FUNCTION public.find_duplicate_profiles(
  p_legal_name text,
  p_birthdate date,
  p_gender text
)
RETURNS TABLE(
  profile_id uuid,
  auth_user_id uuid,
  handle text,
  display_name text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  IF p_legal_name IS NULL OR length(trim(p_legal_name)) = 0
     OR p_birthdate IS NULL OR p_gender IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.auth_user_id,
    p.handle,
    p.display_name,
    p.role::text,
    p.created_at
  FROM public.profiles p
  WHERE p.legal_name = trim(p_legal_name)
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    -- 본인 묶음(같은 auth_user_id) 제외
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id
  ORDER BY p.created_at ASC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text) TO authenticated;

COMMIT;

SELECT 'OK 0098' AS status;
