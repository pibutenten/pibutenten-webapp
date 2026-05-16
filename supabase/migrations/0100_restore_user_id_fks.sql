-- 0100_restore_user_id_fks.sql
-- Phase 5-2 (2026-05-16): card_likes / card_saves / comment_likes.user_id
-- → profiles(id) FK 복구.
--
-- 배경:
--   0047_phase9_master.sql 에서 qa_likes_user_id_fkey / qa_saves_user_id_fkey /
--   comment_likes_user_id_fkey 를 drop. 이후 0085에서 comments.author_id 만 복구.
--   나머지 3개는 FK 없이 방치되어 다음 위험:
--     - profile 삭제 시 orphan row (counter trigger 미발화 → 카운트 drift)
--     - admin /comments 페이지에서 "6 rows but blank" 류 회귀
--
-- 사전 확인 (2026-05-16):
--   - card_likes orphan = 0
--   - card_saves orphan = 0
--   - comment_likes orphan = 0
--   → FK 즉시 추가 안전.
--
-- 정책:
--   ON DELETE CASCADE — profile 삭제 시 본인의 like/save 도 함께 사라짐.
--   (Phase 6 탈퇴 익명화는 cards.author_id 등 콘텐츠 측만 더미 sentinel 이전.
--    인터랙션은 본인 prefer/intent 데이터라 cascade 가 맞음.)

ALTER TABLE public.card_likes
  ADD CONSTRAINT card_likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.card_saves
  ADD CONSTRAINT card_saves_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.comment_likes
  ADD CONSTRAINT comment_likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
