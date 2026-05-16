-- 0107c_anonymize_delete_profile_rows.sql
-- Phase 6-7 fix #2 (2026-05-16): profiles 테이블에 auth.users FK 가 없어서
--   admin.auth.admin.deleteUser() 시 profiles row 가 cascade 삭제되지 않는 문제.
--
-- 발견 경위: E2E 가입/탈퇴 테스트 실행 중 step 9 (profiles cascade) 실패.
--   확인 결과 profiles 에 auth.users → profiles FK 자체가 없음.
--   (profiles.id 는 PK 이고 application 코드에서 auth.uid() 와 동일 UUID 사용하지만,
--    DB 레벨 FK 가 없어 cascade 발동 X.)
--
-- 결정: FK 추가 vs RPC 에서 직접 DELETE
--   - FK 추가는 historical row 영향 (예: 옛 auth.users 가 없는 row 가 있다면 FK 실패)
--   - RPC 에서 sentinel 이관 후 직접 DELETE 가 단순 + 안전
--
-- 변경: anonymize_user_content_before_delete RPC 끝에
--   DELETE FROM profiles WHERE id = ANY(v_bundle) 추가.
--   호출자(/api/me/delete) 는 이 RPC 호출 후 admin.auth.admin.deleteUser 호출 — 동일 순서.

DROP FUNCTION IF EXISTS public.anonymize_user_content_before_delete();

CREATE FUNCTION public.anonymize_user_content_before_delete()
RETURNS TABLE(
  cards_moved int,
  comments_moved int,
  profiles_deleted int
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

  -- 3) profiles 묶음 row 직접 DELETE
  --    cards/comments 의 author_id 는 이미 sentinel 로 이관됐고,
  --    card_likes/card_saves/comment_likes 는 CASCADE FK (0100) 로 동시 삭제됨.
  --    doctor_accounts (있으면) 도 profile_id CASCADE FK 로 동시 정리.
  DELETE FROM public.profiles WHERE id = ANY(v_bundle);
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  RETURN QUERY SELECT v_cards, v_comments, v_profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_content_before_delete() TO authenticated;
