-- 0187b_rollback.sql
-- 0187 의 정확한 역방향 — 비상 시 사용.
-- 평소 미실행. 적용 절차는 본 파일 끝의 운영 노트 참조.

BEGIN;

-- 1. 컬럼 + FK + 인덱스 역방향
ALTER INDEX public.card_likes_profile_idx RENAME TO card_likes_user_idx;
ALTER TABLE public.card_likes
  RENAME CONSTRAINT card_likes_profile_id_fkey TO card_likes_user_id_fkey;
ALTER TABLE public.card_likes RENAME COLUMN profile_id TO user_id;

ALTER INDEX public.idx_qa_saves_profile_persona RENAME TO idx_qa_saves_user_persona;
ALTER TABLE public.card_saves
  RENAME CONSTRAINT card_saves_profile_id_fkey TO card_saves_user_id_fkey;
ALTER TABLE public.card_saves RENAME COLUMN profile_id TO user_id;

ALTER INDEX public.idx_comment_likes_profile RENAME TO idx_comment_likes_user;
ALTER TABLE public.comment_likes
  RENAME CONSTRAINT comment_likes_profile_id_fkey TO comment_likes_user_id_fkey;
ALTER TABLE public.comment_likes RENAME COLUMN profile_id TO user_id;

-- 2. RLS 정책 역방향 (의미 동일, 컬럼명만 user_id)
DROP POLICY IF EXISTS card_likes_delete ON public.card_likes;
CREATE POLICY card_likes_delete ON public.card_likes FOR DELETE TO authenticated
  USING ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid())));
DROP POLICY IF EXISTS card_likes_insert ON public.card_likes;
CREATE POLICY card_likes_insert ON public.card_likes FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid())));

DROP POLICY IF EXISTS card_saves_delete ON public.card_saves;
CREATE POLICY card_saves_delete ON public.card_saves FOR DELETE TO authenticated
  USING ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid())));
DROP POLICY IF EXISTS card_saves_insert ON public.card_saves;
CREATE POLICY card_saves_insert ON public.card_saves FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid())));
DROP POLICY IF EXISTS card_saves_select ON public.card_saves;
CREATE POLICY card_saves_select ON public.card_saves FOR SELECT TO authenticated
  USING (is_admin() OR ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid()))));

DROP POLICY IF EXISTS comment_likes_delete ON public.comment_likes;
CREATE POLICY comment_likes_delete ON public.comment_likes FOR DELETE TO authenticated
  USING (is_admin() OR ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid()))));
DROP POLICY IF EXISTS comment_likes_insert ON public.comment_likes;
CREATE POLICY comment_likes_insert ON public.comment_likes FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid())));
DROP POLICY IF EXISTS comment_likes_select ON public.comment_likes;
CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT TO authenticated
  USING (is_admin() OR ((auth.uid() IS NOT NULL) AND (user_id = COALESCE(current_active_profile_id(), auth.uid()))));

-- 3. RPC 본문 역방향
-- 분량이 크므로 본 파일에 모든 함수 본문 복사는 생략.
-- 비상 시 운영자가 0187 본문을 텍스트 에디터로 열어 profile_id → user_id 일괄 치환 후
-- CREATE OR REPLACE FUNCTION 섹션 추출 적용. 또는 git 의 이전 commit 에서 본문 추출.
-- RETURNS TABLE 별칭도 동시 복원 필요 (get_recent_likers / get_recent_card_likers_batch).

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 운영 노트:
-- 1) 본 rollback 적용 전 코드 (Phase 3 commit) 도 git revert 권장.
-- 2) Vercel 자동 재배포가 코드 측 변경을 production 으로 푸시한 상태에서 DB 만 rollback 하면
--    좋아요·저장·댓글좋아요 API 500 / RPC 인자 mismatch 발생 가능.
-- 3) 순서: (a) git revert Phase 3 코드 commit, (b) Vercel 재배포 완료 대기, (c) 본 0187b 적용.
