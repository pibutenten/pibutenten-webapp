-- 0114_notifications_rls_same_group.sql
--
-- notifications RLS 정책을 다른 테이블과 동일한 `same_group_profile_ids()` 패턴으로 통일.
--
-- 배경:
--   0062 의 정책은 `recipient_id = auth.uid() OR auth_user_id = auth.uid()` 만 검사.
--   0099 에서 cards / comments / card_likes / card_saves 등은 묶음 인지 RLS 로 통일됐으나
--   notifications 는 누락 — doctor 부계정에서 본계 알림 조회 시 정책 모호.
--
-- 변경:
--   기존 정책 DROP → `same_group_profile_ids(auth.uid())` 패턴으로 재정의.
--   같은 묶음(auth_user_id) 안의 어떤 profile.id 가 recipient_id 든 모두 조회 가능.
--
-- 영향:
--   - doctor 멀티 계정 사용자: 부계정에서도 본계 알림 조회 가능 (UX 개선)
--   - 일반 단일 사용자: 동작 변화 없음
--
-- 회귀 위험:
--   - 정책 변경이므로 적용 직후 알림 unread count / 목록 표시 확인
--   - 다른 사람 알림이 새지 않는지 (auth_user_id 묶음 검증)

-- 1) 기존 정책 DROP
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;

-- 2) 묶음 인지 SELECT
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_id IN (
      SELECT same_group_profile_ids(auth.uid())
    )
  );

-- 3) 묶음 인지 UPDATE (read_at 설정만)
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    recipient_id IN (
      SELECT same_group_profile_ids(auth.uid())
    )
  )
  WITH CHECK (
    recipient_id IN (
      SELECT same_group_profile_ids(auth.uid())
    )
  );

-- INSERT 정책은 별도 — DB 트리거가 SECURITY DEFINER 로 INSERT 하므로 RLS 우회.
-- 직접 INSERT 는 차단 유지 (기존 정책 없음 = 차단됨).
