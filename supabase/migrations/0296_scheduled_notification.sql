-- 0296_scheduled_notification.sql
-- 후기·시술일기 통합 Phase 2 — 예약 알림 적재 테이블 (dormant)
-- 정본 계획서 §6.2 (review-diary-unification-master-plan.md) DDL 그대로.
--
-- 범위 한정: 본 단계는 "예약 행을 적재할 테이블"만 만든다.
--   - firing(cron / run_diary_reminders) 은 만들지 않는다(P4).
--   - notifications.kind CHECK 추가·notification-kinds.ts·KIND_TITLES 도 손대지 않는다
--     (notifications_kind_check / notification-kinds.ts 는 follow 세션과 공유 → P4/P5 보류).
-- 전부 순신규 테이블 — 기존 데이터 영향 0. 호출하는 UI/RPC 없음(dormant).
--
-- kind 를 scheduled_notification 안에서 별도 CHECK 로 두는 이유(§6.2): notifications.kind
--   CHECK 와 분리(예약 사유 vs 실제 발사 kind 매핑은 발사 단계 소관, 동일 enum 강제 안 함).

BEGIN;

CREATE TABLE public.scheduled_notification (
  id            bigserial PRIMARY KEY,
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('review_checkin','diary_incomplete')),
  visit_id      bigint REFERENCES public.diaries(id) ON DELETE CASCADE,
  review_id     bigint REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  timepoint     text CHECK (timepoint IN ('week1','month1','month4')),  -- day0는 즉시이므로 예약 대상 아님
  fire_after    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','cancelled','skipped')),
  sent_at       timestamptz,
  message       text NOT NULL,                   -- 비식별(§6.6)
  url           text NOT NULL,                   -- checkin 폼 딥링크
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ★멱등 UNIQUE 는 트랙별 부분 인덱스로 분리(§6.2, 기술 검증 major 반영).
--   트랙 A(review_checkin): 한 visit 다중 시술 → review 여러 개 × 3시점이므로
--     (review_id,timepoint)로만 멱등. visit_id 는 같은 visit 내 여러 행에 중복 정상.
--   트랙 B(diary_incomplete): visit당 1건 회수이므로 visit_id 로 멱등.
CREATE UNIQUE INDEX uq_sched_notif_checkin
  ON public.scheduled_notification (review_id, timepoint)
  WHERE kind = 'review_checkin';
CREATE UNIQUE INDEX uq_sched_notif_incomplete
  ON public.scheduled_notification (visit_id)
  WHERE kind = 'diary_incomplete';

-- due 스캔용 부분 인덱스(발사 배치 = pending 행만 fire_after 순회).
CREATE INDEX idx_sched_notif_due
  ON public.scheduled_notification (fire_after)
  WHERE status = 'pending';

ALTER TABLE public.scheduled_notification ENABLE ROW LEVEL SECURITY;

-- ★owner-only SELECT — notifications_select_own 과 토씨까지 동일(D-G, §6.2 [치명] 정정).
--   라이브 확인: notifications_select_own = roles {authenticated},
--     qual ((auth.uid() IS NOT NULL) AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid()))).
--   recipient_id 는 profiles(id)(=active 명함) FK 이므로 auth.uid()(로그인 UUID)와 직접비교하면
--   묶음 명함(profiles 129행 중 10행 id<>auth_user_id)의 예약을 소유자가 못 보는 [치명] 버그.
CREATE POLICY sched_notif_read_own ON public.scheduled_notification
  FOR SELECT TO authenticated
  USING (
    (auth.uid() IS NOT NULL)
    AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid()))
  );

-- 테이블레벨 SELECT 권한(없으면 RLS 정책이 inert — 0295 와 동일 교훈).
--   쓰기(INSERT/UPDATE/DELETE)는 적재·발사 RPC(SECURITY DEFINER) 전용 → grant 추가 안 함.
--   service_role 은 RLS 우회 + 전체 권한 → 무변경. anon 은 예약 미노출 유지.
GRANT SELECT ON public.scheduled_notification TO authenticated;

COMMIT;
