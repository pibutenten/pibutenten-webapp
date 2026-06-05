-- 0239_report_notification.sql
-- 2026-06-06 — 관리자 신고 알림 신설 (4-2 STEP D).
--
-- 배경:
--   content_reports 신고 접수 시 관리자(profiles.role='admin')에게 실시간 알림이 없었다
--   (STEP A 진단: content_reports 트리거 0건). 신고는 즉시 대응 대상이라 실시간 fan-out 신설.
--
-- 변경:
--   1) notifications_kind_check 에 'report' 추가 (기존 6종 전부 보존 → 7종).
--      기존 이력(new_ask 36행 등)은 7종 부분집합이라 제약 위반 0.
--   2) content_reports AFTER INSERT 트리거 + 함수(SECURITY DEFINER):
--      admin profile 들에 'report' 알림 fan-out (신고자가 admin 이면 본인 제외).
--      'report' 전용 pref 컬럼은 신설하지 않음 — 관리자 상시 수신(운영 의무 알림, 토글 없음).
--      알림 적재 실패가 신고 접수(content_reports INSERT)를 롤백시키지 않도록 EXCEPTION 으로 격리.

BEGIN;

-- 1) kind CHECK 7종 재생성
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment'::text, 'reply'::text, 'like'::text,
    'new_ask'::text, 'review_request'::text, 'published'::text,
    'report'::text
  ]));

-- 2) 신고 알림 fan-out 함수 + 트리거
CREATE OR REPLACE FUNCTION public.on_content_report_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- best-effort: 알림 fan-out 실패가 신고 접수를 롤백시키지 않게 격리.
  BEGIN
    INSERT INTO public.notifications
      (recipient_id, kind, actor_id, card_id, comment_id, message, url)
    SELECT
      p.id,
      'report',
      NEW.reporter_profile_id,
      NEW.card_id,
      NEW.comment_id,
      '새 신고가 접수되었습니다',
      '/admin/reports'
    FROM public.profiles p
    WHERE p.role = 'admin'
      -- 신고자가 관리자면 본인은 제외.
      AND (NEW.reporter_profile_id IS NULL OR p.id <> NEW.reporter_profile_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[report_notification] fan-out insert failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_content_report_notification ON public.content_reports;
CREATE TRIGGER trg_content_report_notification
AFTER INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.on_content_report_for_notification();

COMMIT;

SELECT 'OK 0239' AS status;
