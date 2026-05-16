-- 0099_rls_phase9_rewrite.sql
-- Phase 5-1 (2026-05-16): RLS 정책 Phase 9 재작성 + qas_* → cards_*/card_* 정책명 일괄 rename.
--
-- 문제:
--   1) cards.qas_public_read 의 마지막 분기 `author_id = auth.uid()` 는 Phase 9에서 깨짐.
--      → cards.author_id 는 profiles.id, 그러나 auth.uid()는 auth.users.id 이므로
--        sub-profile (auth_user_id ≠ id) 작성자는 본인 draft 를 못 봄.
--   2) comments.comments_select 동일 문제 (auth.uid() = author_id).
--   3) comment_likes RLS 3개 모두 `user_id = auth.uid()` — sub-profile 좋아요 차단.
--   4) cards.'qas: public read published' 정책은 qas_public_read 가 status='published'로 커버하므로 중복.
--   5) 정책명이 여전히 qas_*/qa_* — 감사 시 혼란.
--
-- 해결:
--   - author_id/user_id 비교는 `IN (SELECT same_group_profile_ids(auth.uid()))` 패턴으로 통일.
--   - 모든 정책에 admin override (is_admin()) 보장.
--   - qas_* → cards_*, qa_* → card_* 일괄 rename.
--
-- 안전성:
--   - DROP/CREATE 패턴 (RLS DROP 도 트랜잭션 안전).
--   - Postgres DDL transaction wrapping (이 마이그레이션 전체가 atomic).

-- ─────────────────────────────────────────────────────────────────
-- 1) cards: redundant policy DROP + qas_public_read 재작성
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "qas: public read published" ON public.cards;

DROP POLICY IF EXISTS "qas_public_read" ON public.cards;
CREATE POLICY "cards_public_read" ON public.cards
  FOR SELECT
  USING (
    status = 'published'::qa_status
    OR is_admin()
    OR (auth.uid() IS NOT NULL AND doctor_id = current_doctor_id())
    -- Phase 9: author 본인 묶음 안의 모든 profile 이 본인 draft 를 볼 수 있어야 함
    OR (auth.uid() IS NOT NULL
        AND author_id IN (SELECT same_group_profile_ids(auth.uid())))
  );

-- 기타 cards 정책 cosmetic rename (qas_* → cards_*)
ALTER POLICY "qas_admin_all" ON public.cards RENAME TO "cards_admin_all";
ALTER POLICY "qas_doctor_delete" ON public.cards RENAME TO "cards_doctor_delete";
ALTER POLICY "qas_doctor_update" ON public.cards RENAME TO "cards_doctor_update";

-- ─────────────────────────────────────────────────────────────────
-- 2) comments: comments_select Phase 9 재작성
-- ─────────────────────────────────────────────────────────────────
-- 기존: auth.uid() = author_id (broken under Phase 9)
DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT
  USING (
    status = 'visible'::comment_status
    OR is_admin()
    OR (auth.uid() IS NOT NULL
        AND author_id IN (SELECT same_group_profile_ids(auth.uid())))
    OR (current_doctor_id() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.cards c
          WHERE c.id = comments.card_id
            AND c.doctor_id = current_doctor_id()
        ))
  );

-- comments_admin_all 은 이미 cards q 참조 (qas 아님) — 본문 변경 불필요. rename도 이미 comments_*.

-- ─────────────────────────────────────────────────────────────────
-- 3) comment_likes: 3개 정책 Phase 9 재작성 + admin override
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comment_likes_self_select" ON public.comment_likes;
DROP POLICY IF EXISTS "comment_likes_self_insert" ON public.comment_likes;
DROP POLICY IF EXISTS "comment_likes_self_delete" ON public.comment_likes;

CREATE POLICY "comment_likes_select" ON public.comment_likes
  FOR SELECT
  USING (
    user_id IN (SELECT same_group_profile_ids(auth.uid()))
    OR is_admin()
  );

CREATE POLICY "comment_likes_insert" ON public.comment_likes
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT same_group_profile_ids(auth.uid()))
  );

CREATE POLICY "comment_likes_delete" ON public.comment_likes
  FOR DELETE
  USING (
    user_id IN (SELECT same_group_profile_ids(auth.uid()))
    OR is_admin()
  );

-- ─────────────────────────────────────────────────────────────────
-- 4) card_likes / card_saves: 정책명만 rename (본문은 이미 Phase 9 준수)
-- ─────────────────────────────────────────────────────────────────
ALTER POLICY "qa_likes_select" ON public.card_likes RENAME TO "card_likes_select";
ALTER POLICY "qa_likes_insert_own" ON public.card_likes RENAME TO "card_likes_insert";
ALTER POLICY "qa_likes_delete_own" ON public.card_likes RENAME TO "card_likes_delete";

ALTER POLICY "qa_saves_self_select" ON public.card_saves RENAME TO "card_saves_select";
ALTER POLICY "qa_saves_self_insert" ON public.card_saves RENAME TO "card_saves_insert";
ALTER POLICY "qa_saves_self_delete" ON public.card_saves RENAME TO "card_saves_delete";

-- ─────────────────────────────────────────────────────────────────
-- 5) card_views / card_impressions: 정책명 rename
-- ─────────────────────────────────────────────────────────────────
ALTER POLICY "qa_views: admin select" ON public.card_views RENAME TO "card_views_admin_select";
ALTER POLICY "qa_views: anyone insert" ON public.card_views RENAME TO "card_views_anyone_insert";

ALTER POLICY "qa_impressions_select_admin" ON public.card_impressions RENAME TO "card_impressions_admin_select";
ALTER POLICY "qa_impressions_insert_all" ON public.card_impressions RENAME TO "card_impressions_anyone_insert";

-- card_shares 는 이미 0095 에서 rename 완료 (card_shares: admin select / card_shares: anyone insert).
-- 다만 콜론 형식이 어색하므로 동일하게 underscore 형식으로 통일.
ALTER POLICY "card_shares: admin select" ON public.card_shares RENAME TO "card_shares_admin_select";
ALTER POLICY "card_shares: anyone insert" ON public.card_shares RENAME TO "card_shares_anyone_insert";
