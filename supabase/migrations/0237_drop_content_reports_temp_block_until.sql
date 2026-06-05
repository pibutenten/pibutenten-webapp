-- 0237_drop_content_reports_temp_block_until.sql
-- 2026-06-05 — content_reports.temp_block_until 죽은 컬럼 제거.
--
-- 배경:
--   0137 에서 "30일 임시조치 만료 시각" 의도로 도입했으나, 배치 ④(2026-05-28)에서
--   모더레이션 정책을 영구 숨김(status='hidden')으로 채택하면서 임시조치 자체가 폐기됨.
--   코드·RPC·뷰 어디에서도 temp_block_until 을 읽거나 쓰지 않음(grep 0건 확인).
--
-- 변경:
--   ALTER TABLE content_reports DROP COLUMN temp_block_until.

BEGIN;

ALTER TABLE public.content_reports
  DROP COLUMN IF EXISTS temp_block_until;

COMMIT;

SELECT 'OK 0237' AS status;
