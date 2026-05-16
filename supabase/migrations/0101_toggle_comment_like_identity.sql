-- 0101_toggle_comment_like_identity.sql
-- Phase 5-3 (2026-05-16): toggle_comment_like RPC 에 p_identity_id 파라미터 추가.
--
-- 배경:
--   기존 시그니처: toggle_comment_like(p_comment_id bigint)
--     - 내부에서 auth.uid() 를 user_id 로 사용 → sub-profile 좋아요가 항상
--       primary profile (auth user id) 로 기록됨. Phase 9 모델 위반.
--
--   toggle_card_like / toggle_card_save 와 동일한 패턴으로 통일:
--     - 시그니처: (p_comment_id bigint, p_identity_id uuid)
--     - p_identity_id = NULL → primary profile (= auth.uid()) fallback
--     - p_identity_id = UUID → 본인 묶음 안 검증 후 그 profile.id 로 기록
--
-- 보안:
--   - SECURITY DEFINER + search_path lock
--   - p_identity_id 가 본인 묶음 (same_group_profile_ids(auth.uid())) 멤버인지 검증
--     → 다른 사람 profile cookie 위조 방어
--
-- 호환성:
--   - 옛 시그니처 (p_comment_id only) DROP. 호출처 (CommentsBlock.tsx) 1곳을
--     동일 PR에서 업데이트.

DROP FUNCTION IF EXISTS public.toggle_comment_like(bigint);

CREATE OR REPLACE FUNCTION public.toggle_comment_like(
  p_comment_id bigint,
  p_identity_id uuid DEFAULT NULL
)
RETURNS TABLE(liked boolean, like_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_target uuid;
  v_count integer;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  -- p_identity_id 가 주어진 경우: 본인 묶음 안 멤버인지 검증
  IF p_identity_id IS NOT NULL THEN
    IF NOT (p_identity_id = ANY(SELECT same_group_profile_ids(v_auth))) THEN
      RAISE EXCEPTION 'identity not in own bundle';
    END IF;
    v_target := p_identity_id;
  ELSE
    -- NULL → primary profile (= auth.uid())
    v_target := v_auth;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_target
  ) THEN
    DELETE FROM public.comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_target;
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT false, v_count;
  ELSE
    INSERT INTO public.comment_likes (comment_id, user_id)
    VALUES (p_comment_id, v_target);
    SELECT c.like_count INTO v_count FROM public.comments c WHERE c.id = p_comment_id;
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

-- 권한 부여 (anon/authenticated 모두 가능 — 내부에서 auth 검증)
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(bigint, uuid) TO authenticated;
