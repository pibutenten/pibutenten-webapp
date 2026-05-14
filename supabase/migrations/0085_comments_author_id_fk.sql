-- 0085: comments.author_id FK 추가 → profiles(id)
--
-- 외부 점검 보고서(2026-05-14, 2차): /admin/comments 페이지가 "6건"이라 표기하면서 본문은 비어있음.
-- 원인: Supabase relationship resolution이 FK 없는 컬럼은 join 못 함.
--      page.tsx의 `author:author_id(handle, display_name)` 쿼리 실패 → rows = [].
--      count(EXACT, head:true)는 별도 쿼리라 6 정상 반환 → 헤더/본문 수치 불일치.
--
-- 데이터 검증 완료 — 현 comments.author_id는 모두 profiles.id와 1:1 매칭.
-- (Phase 9 model: profile.id = auth.users.id 가 primary, 추가 profile은 별도 UUID)
-- /api/comments POST도 0085 이전 active profile.id로 저장하도록 fix됨 (idCtx.active.profileId).

ALTER TABLE public.comments
  ADD CONSTRAINT comments_author_id_fkey
  FOREIGN KEY (author_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

SELECT 'OK 0085' AS status;
