-- 0109_soft_delete_anonymization.sql
-- Phase 7-extra (2026-05-16): sentinel → soft-delete in-place 전환.
--
-- 배경:
--   0107 의 공유 sentinel(id=00000000-...) 방식은 모든 탈퇴자 콘텐츠를
--   한 row 로 합쳐서 표시 → 서로 다른 사람도 동일 인물처럼 보이는 한계.
--   네이버 카페 / Discord / SO 방식: 각자 본인 row 보존 + in-place 익명화.
--
-- 변경:
--   1) profiles.deleted_at TIMESTAMPTZ 컬럼 추가
--   2) sentinel row(id=00000000-...) DELETE
--   3) anonymize_user_content_before_delete RPC 재작성:
--      - cards/comments author_id 이전 X (각 row 가 본인 row 그대로 가리킴)
--      - profiles DELETE X (in-place 마스킹)
--      - handle → 'deleted-{12hex}' (UNIQUE 보장)
--      - display_name → '(탈퇴한 사용자)' (네이버 카페 식 — 모두 동일)
--      - PII 모두 NULL / 빈값
--      - auth_user_id → NULL (auth.users 와의 link 끊기)
--      - deleted_at → now()
--   4) profile lookup 시 deleted_at IS NULL 필터는 application 측 책임.
--      RLS profiles_public_select 는 qual=true 그대로 (cards join 시 표시 필요).

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) deleted_at 컬럼 + 인덱스
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.deleted_at IS
  '탈퇴 시각. NULL = 활성 사용자. 설정 시 row 는 in-place 익명화된 상태.';

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 활성 사용자 빠른 조회용 partial index (대부분 쿼리가 active 만 봄)
CREATE INDEX IF NOT EXISTS profiles_active_idx
  ON public.profiles(id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2) sentinel row 제거
--     2026-05-16 시점 sentinel 가리키는 cards/comments = 0 건 확인됨.
--     앞으로는 각 탈퇴자 본인 row 가 그 역할을 함.
-- ─────────────────────────────────────────────────────────────────
DELETE FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000000';

-- ─────────────────────────────────────────────────────────────────
-- 3) anonymize RPC 재작성 — soft-delete in place
-- ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.anonymize_user_content_before_delete();

CREATE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(profiles_anonymized int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_bundle uuid[];
  v_profiles int := 0;
  v_id uuid;
  v_mask text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  SELECT array_agg(id) INTO v_bundle
  FROM public.profiles
  WHERE id = v_auth OR auth_user_id = v_auth;

  IF v_bundle IS NULL OR array_length(v_bundle, 1) = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  -- 묶음 안 각 row 를 본인 row id 기반 handle 로 마스킹.
  -- handle UNIQUE 인덱스 통과 보장: UUID 의 12 hex prefix 는 충돌 확률 ~0.
  FOREACH v_id IN ARRAY v_bundle LOOP
    v_mask := 'deleted-' || substring(replace(v_id::text, '-', ''), 1, 12);
    UPDATE public.profiles
    SET
      handle = v_mask,
      display_name = '(탈퇴한 사용자)',
      avatar_url = NULL,
      bio = NULL,
      legal_name = NULL,
      birthdate = NULL,
      gender = NULL,
      face_shape = NULL,
      skin_type = NULL,
      skin_concerns = '{}'::text[],
      interested_procedures = '{}'::text[],
      liked_procedures = '{}'::text[],
      field_visibility = '{}'::jsonb,
      marketing_email_consent = false,
      is_public = false,
      auth_user_id = NULL,
      deleted_at = now(),
      updated_at = now()
    WHERE id = v_id;
    v_profiles := v_profiles + 1;
  END LOOP;

  -- cards.author_id / comments.author_id 는 그대로 유지.
  -- 그 row 들이 가리키는 profile 이 이미 익명 상태이므로 UI 가 자동으로 "(탈퇴한 사용자)" 표시.

  RETURN QUERY SELECT v_profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_content_before_delete() TO authenticated;

COMMIT;

SELECT 'OK 0109' AS status;
