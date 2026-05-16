-- 0107_deleted_user_sentinel.sql
-- Phase 6-7 (2026-05-16): 탈퇴 익명화 — 더미 sentinel 계정 도입.
--
-- 목적:
--   회원 탈퇴 시 콘텐츠(글·댓글)는 보존, 작성자 정보는 익명화.
--   기존: cards.author_id / comments.author_id 가 ON DELETE SET NULL 이라
--         탈퇴 시 author_id=NULL → UI 가 author 없는 카드를 처리 못 함.
--   변경: 탈퇴 시 author_id 를 sentinel("탈퇴한 사용자") 로 옮김 + PII NULL.
--
-- sentinel profile:
--   - id (UUID): well-known fixed UUID '00000000-0000-0000-0000-000000000000'
--   - handle: 'deleted-user'
--   - display_name: '탈퇴한 사용자'
--   - role: 'user'
--   - auth_user_id: NULL (auth.users 와 무관 — 실제 로그인 불가)
--
-- 사용:
--   /api/me/delete 가 auth.users.delete 직전에:
--     1) UPDATE cards SET author_id = SENTINEL WHERE author_id IN (사용자 묶음 profile ids)
--     2) UPDATE comments SET author_id = SENTINEL WHERE 동일
--     3) UPDATE profiles SET legal_name/birthdate/gender/avatar_url/display_name/... = NULL WHERE ...
--     4) admin.auth.admin.deleteUser(user.id) — cascade 로 profiles row 삭제됨

-- ─────────────────────────────────────────────────────────────────
-- 1) sentinel profile UPSERT — well-known UUID
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (
  id, role, handle, display_name, bio,
  auth_user_id, is_public,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'user',
  'deleted-user',
  '탈퇴한 사용자',
  NULL,
  NULL,
  false,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = '탈퇴한 사용자',
  handle = 'deleted-user',
  is_public = false,
  updated_at = now();

-- ─────────────────────────────────────────────────────────────────
-- 2) RPC: 사용자 묶음 콘텐츠를 sentinel 로 이관 + PII NULL
--     /api/me/delete 가 auth.users.delete 전에 호출. SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(
  cards_moved int,
  comments_moved int,
  profiles_anonymized int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_bundle uuid[];
  v_cards int := 0;
  v_comments int := 0;
  v_profiles int := 0;
  v_sentinel uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  -- 묶음 안 모든 profile id
  SELECT array_agg(id) INTO v_bundle
  FROM public.profiles
  WHERE id = v_auth OR auth_user_id = v_auth;

  IF v_bundle IS NULL OR array_length(v_bundle, 1) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- 1) cards.author_id → sentinel
  UPDATE public.cards
  SET author_id = v_sentinel
  WHERE author_id = ANY(v_bundle);
  GET DIAGNOSTICS v_cards = ROW_COUNT;

  -- 2) comments.author_id → sentinel
  UPDATE public.comments
  SET author_id = v_sentinel
  WHERE author_id = ANY(v_bundle);
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  -- 3) profiles PII NULL (display_name/handle 은 익명화 시 마스킹, 단 묶음 row 가 곧 cascade 삭제되므로
  --    실제 효과는 audit trail 잠시 동안만. role 은 변경 X.)
  UPDATE public.profiles
  SET
    legal_name = NULL,
    birthdate = NULL,
    gender = NULL,
    face_shape = NULL,
    skin_type = NULL,
    skin_concerns = NULL,
    interested_procedures = NULL,
    liked_procedures = NULL,
    bio = NULL,
    avatar_url = NULL,
    display_name = '(탈퇴한 사용자)',
    field_visibility = NULL,
    marketing_email_consent = NULL,
    is_public = false,
    updated_at = now()
  WHERE id = ANY(v_bundle);
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  RETURN QUERY SELECT v_cards, v_comments, v_profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_content_before_delete() TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3) cards/comments.author_id FK: SET NULL → SET DEFAULT (sentinel)
--     기존 SET NULL 동작은 RPC 가 명시적으로 sentinel 로 이관하므로 거의 발동 X.
--     안전망으로 default 추가 (auth.users 삭제 시 cascade → profiles 삭제 → FK 검사
--     → 만약 RPC 가 누락된 row 있으면 sentinel 로 자동).
-- ─────────────────────────────────────────────────────────────────
-- 실제로 SET NULL 그대로 두는 게 더 안전 (default 위반 시 row 손실 위험).
-- → 정책: 변경하지 않음. RPC 가 모든 row 를 명시적으로 이관 책임.

-- ─────────────────────────────────────────────────────────────────
-- 4) RLS: sentinel profile 은 누구나 SELECT 가능 (cards_public_read 등이 author 정보 join 시 필요).
--     이미 profiles_public_select policy 가 qual=true 라 통과.
-- ─────────────────────────────────────────────────────────────────
-- 별도 변경 불필요.
