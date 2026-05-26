-- 0161: Phase 2-A — 인터랙션·알림·설정 RLS 일괄 계정 단위 정합 (2026-05-26)
--
-- ADR 0001 + ADR 0011 원칙 정합 (사용자 확정 정책):
--   "모든 데이터는 계정(active profile)별 완전 독립.
--    묶음(auth_user_id 공유) 은 단지 전환 메커니즘일 뿐 권한·기록 공유 X."
--
-- Phase 1 (0159/0160) 은 cards INSERT/UPDATE/DELETE 만 정합. 본 마이그레이션은:
--   1) cards SELECT 정책 잔재 (본인 draft/pending_review 가시성) 정합
--   2) card_likes / card_saves / comments / comment_likes RLS 전체 정합
--   3) notifications RLS 중복 정책 정리 + 계정 단위
--   4) notification_preferences / push_subscriptions 계정 단위
--   ※ push_subscriptions: 디바이스 단위로 묶음 공유가 자연스러울 수 있으나,
--     사용자 정책 명시 "모두 계정별 독립" 에 따라 계정 단위로 변경.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. cards_public_read — SELECT 정책 마지막 분기 계정 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_public_read ON public.cards;
CREATE POLICY cards_public_read ON public.cards
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      deleted_at IS NULL
      AND (
        status = 'published'
        OR (auth.uid() IS NOT NULL AND doctor_id = public.current_doctor_id())
        OR (auth.uid() IS NOT NULL AND author_id = COALESCE(public.current_active_profile_id(), auth.uid()))
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2. card_likes — 계정 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS card_likes_insert ON public.card_likes;
CREATE POLICY card_likes_insert ON public.card_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS card_likes_delete ON public.card_likes;
CREATE POLICY card_likes_delete ON public.card_likes
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- card_likes_select 는 'true' (public) 그대로 유지 — 카운트·좋아한 사람 목록 공개.

-- ─────────────────────────────────────────────────────────────────────
-- 3. card_saves — 계정 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS card_saves_insert ON public.card_saves;
CREATE POLICY card_saves_insert ON public.card_saves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS card_saves_delete ON public.card_saves;
CREATE POLICY card_saves_delete ON public.card_saves
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS card_saves_select ON public.card_saves;
CREATE POLICY card_saves_select ON public.card_saves
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. comments — 계정 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS comments_insert ON public.comments;
CREATE POLICY comments_insert ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS comments_update_self ON public.comments;
CREATE POLICY comments_update_self ON public.comments
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS comments_delete_self ON public.comments;
CREATE POLICY comments_delete_self ON public.comments
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- comments_select: visible + admin + 본인 작성 + 카드 owner (doctor or 본인 카드)
DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments
  FOR SELECT
  USING (
    status = 'visible'::comment_status
    OR public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
    )
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.cards c
        WHERE c.id = comments.card_id
          AND (
            c.doctor_id = public.current_doctor_id()
            OR c.author_id = COALESCE(public.current_active_profile_id(), auth.uid())
          )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 5. comment_likes — 계정 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS comment_likes_insert ON public.comment_likes;
CREATE POLICY comment_likes_insert ON public.comment_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

DROP POLICY IF EXISTS comment_likes_delete ON public.comment_likes;
CREATE POLICY comment_likes_delete ON public.comment_likes
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
    )
  );

DROP POLICY IF EXISTS comment_likes_select ON public.comment_likes;
CREATE POLICY comment_likes_select ON public.comment_likes
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND user_id = COALESCE(public.current_active_profile_id(), auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. notifications — 중복 정책 제거 + 계정 단위 통합
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_self_select ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
DROP POLICY IF EXISTS notifications_self_update ON public.notifications;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND recipient_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND recipient_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND recipient_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 7. notification_preferences — 계정 단위 (사용자 정책: 모두 계정별 독립)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS np_select_own ON public.notification_preferences;
DROP POLICY IF EXISTS np_upsert_own ON public.notification_preferences;

CREATE POLICY np_select_own ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND profile_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

CREATE POLICY np_upsert_own ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND profile_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND profile_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 8. push_subscriptions — 계정 단위 (사용자 정책: 모두 계정별 독립)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS push_subs_own ON public.push_subscriptions;

CREATE POLICY push_subs_own ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND profile_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND profile_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- 검증: 정책 목록
SELECT c.relname AS table, p.polname, p.polcmd, p.polpermissive
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('cards','card_likes','card_saves','comments','comment_likes',
                    'notifications','notification_preferences','push_subscriptions')
ORDER BY c.relname, p.polcmd, p.polname;

COMMIT;
