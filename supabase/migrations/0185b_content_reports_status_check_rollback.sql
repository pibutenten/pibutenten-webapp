-- 0185b_content_reports_status_check_rollback.sql
-- 0185 정확한 역방향. CRITICAL-2 의 신 CHECK 를 0137 정의의 옛 5값 CHECK 로 원복.
--
-- 주의:
--   롤백 시점에 content_reports row 가 신값(resolved_hidden / resolved_deleted /
--   dismissed) 으로 채워져 있다면 ADD CONSTRAINT 가 즉시 실패. 그 경우 수동으로
--   신값 row 를 옛값으로 매핑하거나 (예: resolved_hidden → 'resolved') 삭제 후
--   재실행. 단순 자동 매핑은 의도된 운영 의미를 잃을 수 있어 일부러 미수행.

BEGIN;

ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_status_check;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_status_check
  CHECK (status IN ('pending','investigating','resolved','rejected','temp_blocked'));

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.content_reports'::regclass
    AND conname = 'content_reports_status_check';
  IF v_def NOT ILIKE '%investigating%' THEN
    RAISE EXCEPTION '[0185b rollback] 옛 CHECK 복원 실패: %', v_def;
  END IF;
  RAISE NOTICE '[0185b rollback] OK: %', v_def;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
