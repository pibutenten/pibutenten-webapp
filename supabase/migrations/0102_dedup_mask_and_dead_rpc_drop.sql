-- 0102_dedup_mask_and_dead_rpc_drop.sql
-- Phase 5-4 (2026-05-16):
--   1) find_duplicate_profiles 반환 형식 변경 — handle/display_name 노출 X, 가입 채널 힌트만
--   2) Dead RPC 일괄 DROP:
--      - decrement_card_like (2개 시그니처)
--      - increment_card_like (2개 시그니처)
--      - get_recent_card_likers (singular, persona 컬럼 참조해 깨진 상태)
--
-- 배경 (find_duplicate_profiles 변경):
--   기존: handle, display_name 등 노출 → (이름+생일+성별) 알면 핸들 확인 가능한
--   account enumeration 벡터. UX 측면에서도 본인 계정인지 사용자가 100% 확신 X.
--   변경: count + provider 힌트만 (예: ['google', 'kakao']) → 본인 가입 방법을
--   사용자가 더 잘 인지할 수 있게.

-- ─────────────────────────────────────────────────────────────────
-- 1) find_duplicate_profiles 재정의 — 반환 형식 변경
-- ─────────────────────────────────────────────────────────────────
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
BEGIN
  IF v_user_id IS NULL THEN
    -- 비로그인 — 빈 결과
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;
  IF p_legal_name IS NULL OR length(trim(p_legal_name)) = 0
     OR p_birthdate IS NULL OR p_gender IS NULL THEN
    RETURN QUERY SELECT 0::int, ARRAY[]::text[];
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::int AS match_count,
    COALESCE(
      array_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL),
      ARRAY[]::text[]
    ) AS providers
  FROM public.profiles p
  LEFT JOIN auth.identities i ON i.user_id = p.auth_user_id
  WHERE p.legal_name = trim(p_legal_name)
    AND p.birthdate = p_birthdate
    AND p.gender = p_gender
    -- 본인 묶음(같은 auth_user_id) 제외
    AND (p.auth_user_id IS NULL OR p.auth_user_id != v_user_id)
    AND p.id != v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_profiles(text, date, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2) Dead RPC 일괄 DROP
-- ─────────────────────────────────────────────────────────────────
-- toggle_card_like 로 대체된 옛 카운터 함수들
DROP FUNCTION IF EXISTS public.decrement_card_like(bigint);
DROP FUNCTION IF EXISTS public.decrement_card_like(integer);
DROP FUNCTION IF EXISTS public.increment_card_like(bigint);
DROP FUNCTION IF EXISTS public.increment_card_like(integer);

-- 0090에서 card_likes.persona 컬럼 drop 후 작동 불능 상태로 방치된 singular RPC.
-- LikersDialog.tsx 는 이미 get_recent_card_likers_batch 사용 중.
DROP FUNCTION IF EXISTS public.get_recent_card_likers(bigint, integer);
