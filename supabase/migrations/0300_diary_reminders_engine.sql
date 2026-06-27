-- 0300_diary_reminders_engine.sql
-- 후기·시술일기 통합 P4 — 예약 알림 발사 백엔드(리텐션 엔진). 정본 계획서 §6.4/§6.5.
--
-- 범위: dormant 발사 엔진. scheduled_notification(0296, 현재 0행)에서 due 행을
--   notifications 로 승급(=발사)하는 RPC + 상태행 + 토글 컬럼 + kind 확장.
--   예약 행을 만드는 UI/적재 RPC(트랙 A day0 / 트랙 B 통합작성)는 본 마이그 범위 아님 → 발사 0건.
--
-- 구성:
--   1. notification_preferences 토글 2컬럼(pref_review_checkin / pref_diary_incomplete) — FIX-5 결선용.
--   2. diary_reminder_state 단일행 상태테이블 — keyword_digest_state 패턴 복제(동시실행 직렬화 커서).
--   3. notifications.kind CHECK 에 'diary_reminder' 추가 — 기존 9종 전부 보존 + 1종 추가.
--      (notification-kinds.ts / KIND_TITLES 동기화는 FOLLOW 공유영역이라 본 마이그 미포함 — 머지 후 TODO.
--       프런트 알림목록·푸시 제목 모두 미지 kind 에 graceful fallback 확인됨:
--         NotificationsClient: mode ?? 'label', label ?? '새 알림', icon ?? '•'.
--         /api/push/send KIND_TITLES[kind] || '피부텐텐'. → diary_reminder INSERT 안전.)
--   4. run_diary_reminders() RPC — 단일 CTE 체인(locked→fired→mark_sent/mark_skip) 발사 + 멱등.
--
-- 무회귀: 토글 컬럼 default true(기존 발사 영향 0), kind 추가(기존 9종 보존),
--   상태테이블 신규 1행, RPC 신규. scheduled_notification 0행이라 호출돼도 발사 0.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 토글 2컬럼 (§6.5). default true = 기본 ON. 기존 행에도 즉시 true 채워짐(무회귀).
--    발사 게이트 결선(FIX-5)은 run_diary_reminders 의 LEFT JOIN + COALESCE 로 아래 4번에서.
--    (prefs API 라우트·get_my_notification_prefs/save_my_notification_prefs RPC 노출은
--     FOLLOW 공유 영역 일부와 동선 겹쳐 본 마이그 미포함 — 머지 후 동기화 TODO. 컬럼 default true 라
--     노출 전까지도 토글 OFF 불가 = 항상 발사 = 기존 의도와 일치.)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_review_checkin   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_diary_incomplete boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. diary_reminder_state — 단일행 커서/잠금 상태테이블 (keyword_digest_state 패턴).
--    id boolean PK = true 한 행만 허용. last_run_at 은 관측용(발사는 fire_after 기준이라
--    커서 윈도우에 의존하지 않음 — keyword-digest 와 달리 시점 비교 대신 due 스캔).
--    FOR UPDATE 로 동시 cron 인스턴스 직렬화.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diary_reminder_state (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  last_run_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.diary_reminder_state (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. notifications.kind CHECK 확장 — 기존 9종 전부 보존 + 'diary_reminder' 추가.
--    DROP + ADD (CHECK 는 ALTER 로 in-place 수정 불가). 라이브 9종을 그대로 나열.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment','reply','like','save','review_request',
    'published','report','keyword','follow_post',
    'diary_reminder'
  ]::text[]));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. run_diary_reminders() — 발사 디스패처. 트리거 아님·멱등·단일 트랜잭션.
--    §6.4 정본: locked(due 전부 SKIP LOCKED 잠금 + eligible 산출) → fired(eligible 만
--    notifications INSERT) → mark_sent(locked∩eligible) / mark_skip(locked∩¬eligible∩diary_incomplete).
--    sent/skipped 는 locked id 집합에서만 분기 → SKIP LOCKED 로 건너뛴 행은 어느 쪽도 마킹 안 됨
--    (이중승급·'미발사인데 sent' 0). reminder_stage 전진은 mark_sent id 집합 기준(sent_at 근사 아님).
--
--    토글 게이트(FIX-5): eligible 산출에 LEFT JOIN notification_preferences +
--      review_checkin → COALESCE(pref_review_checkin, true),
--      diary_incomplete → COALESCE(pref_diary_incomplete, true) AND (미완성·뮤트 아님) 재확인.
--    NULL pref 행은 COALESCE 로 true = 발사(기본 ON).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_diary_reminders()
RETURNS TABLE(fired integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_start timestamptz := now();
  v_fired   integer := 0;
  v_skipped integer := 0;
BEGIN
  -- 커서 잠금(동시 cron 인스턴스 직렬화). keyword_digest 동일 idiom.
  PERFORM 1 FROM public.diary_reminder_state WHERE id = true FOR UPDATE;

  WITH locked AS (
    -- due 후보 전부(자격 탈락분 포함)를 SKIP LOCKED 로 잠그고 eligible 플래그 산출.
    --   토글 게이트 + diary_incomplete 발사 직전 자격 재확인을 eligible 안에 결합.
    SELECT
      s.id,
      s.kind,
      s.visit_id,
      (
        -- 토글 게이트(FIX-5): kind 별 pref. NULL → true(기본 ON).
        CASE s.kind
          WHEN 'review_checkin'   THEN COALESCE(np.pref_review_checkin, true)
          WHEN 'diary_incomplete' THEN COALESCE(np.pref_diary_incomplete, true)
          ELSE true
        END
        AND
        -- diary_incomplete 만 미완성·비뮤트 재확인(트랙 B 중단1: update_visit 으로 완성/뮤트된
        --   잔여 pending 은 여기서 자격 탈락 → mark_skip). review_checkin 은 이 조건 비적용.
        CASE
          WHEN s.kind = 'diary_incomplete' THEN EXISTS (
            SELECT 1 FROM public.diaries d
             WHERE d.id = s.visit_id
               AND d.is_complete = false
               AND d.reminder_muted = false
          )
          ELSE true
        END
      ) AS eligible
      FROM public.scheduled_notification s
      LEFT JOIN public.notification_preferences np
        ON np.profile_id = s.recipient_id
     WHERE s.status = 'pending'
       AND s.fire_after <= v_run_start
     FOR UPDATE OF s SKIP LOCKED
  ),
  fired AS (
    -- 발사: eligible 만 notifications 승급. 푸시는 trg_notifications_push_webhook 자동.
    --   actor_id/card_id/comment_id/payload 는 미지정(NULL) — message/url-only 행.
    --   kind = 'diary_reminder' (정식 신규 kind, FIX-4 임시 매핑 대체).
    INSERT INTO public.notifications (kind, recipient_id, message, url, created_at)
    SELECT 'diary_reminder', s.recipient_id, s.message, s.url, v_run_start
      FROM public.scheduled_notification s
      JOIN locked l ON l.id = s.id AND l.eligible
    RETURNING 1
  ),
  mark_sent AS (
    -- 발사된 행만 sent 마킹(locked ∩ eligible).
    UPDATE public.scheduled_notification s
       SET status = 'sent', sent_at = v_run_start
      FROM locked l
     WHERE s.id = l.id AND l.eligible
    RETURNING s.id, s.kind, s.visit_id
  ),
  mark_skip AS (
    -- 자격 탈락 diary_incomplete(완성/뮤트/토글OFF)만 skipped(locked ∩ ¬eligible ∩ diary_incomplete).
    --   review_checkin 토글 OFF 는 발사 보류(pending 유지) — skipped 아님(추후 토글 ON 시 발사 가능).
    UPDATE public.scheduled_notification s
       SET status = 'skipped'
      FROM locked l
     WHERE s.id = l.id AND NOT l.eligible AND l.kind = 'diary_incomplete'
    RETURNING s.id
  ),
  -- reminder_stage 전진은 mark_sent 의 diary_incomplete 행 기준(정밀 — sent_at 근사 아님).
  stage_bump AS (
    UPDATE public.diaries d
       SET reminder_stage = d.reminder_stage + 1
      FROM mark_sent ms
     WHERE ms.kind = 'diary_incomplete' AND ms.visit_id = d.id
    RETURNING d.id
  )
  SELECT
    (SELECT count(*) FROM mark_sent)::integer,
    (SELECT count(*) FROM mark_skip)::integer
  INTO v_fired, v_skipped;

  -- 관측용 last_run 전진(발사는 fire_after 기준이라 윈도우 의존 없음).
  UPDATE public.diary_reminder_state SET last_run_at = v_run_start WHERE id = true;

  RETURN QUERY SELECT v_fired, v_skipped;
END;
$function$;

-- 실행 권한: cron 라우트는 service_role(RLS 우회·전체권한)로 호출하므로 별도 GRANT 불필요.
--   anon/authenticated 직접 호출 차단(기본 — SECURITY DEFINER 라도 EXECUTE 권한 없으면 호출 불가).
REVOKE ALL ON FUNCTION public.run_diary_reminders() FROM PUBLIC;

COMMIT;

SELECT 'OK 0300' AS status;
