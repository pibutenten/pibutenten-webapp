-- 0216: 시술 리포트 앵커 공개 플립 (go-live) — 데이터 UPDATE (C 앵커 최종)
--
-- 배경: C1~C4 로 앵커(type=review_summary) 데이터층·URL·저장공유·피드 ×2·밀도캡·admin·
--   검색 중복제거를 모두 코드로 완비. 본 마이그는 앵커를 draft → published 로 전환해
--   ★인앱(피드·/reports·저장/공유)에 한 번에 노출한다.
--
-- 범위: cards 데이터 UPDATE 만(스키마·함수 변경 없음). 대상 = 백필된 앵커 25행(0214).
--   검색엔진/AEO 색인(sitemap·rss·llms·robots)은 본 단계에서 **노출 안 함** —
--   `lib/site.ts` `INCLUDE_REPORT_ANCHORS=false` 게이트 그대로(원장 추후 on).
--
-- ★롤백(되돌리기): 다시 비공개로 내리려면 ↓ 한 줄을 Management API 로 실행.
--   UPDATE public.cards SET status='draft'::qa_status
--     WHERE type='review_summary'::qa_type AND status='published'::qa_status;
--   (앵커는 pibutenten 단독 소유·수치 미저장이라 draft 복귀 시 인앱 노출만 즉시 사라짐.)

BEGIN;

UPDATE public.cards
SET status = 'published'::qa_status,
    updated_at = now()
WHERE type = 'review_summary'::qa_type
  AND status = 'draft'::qa_status;

COMMIT;
