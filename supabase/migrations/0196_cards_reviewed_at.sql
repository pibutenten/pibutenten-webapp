-- 0196: cards.reviewed_at 신설 + 과거 데이터 백필 (P1-b)
--
-- 배경: 의사 검수일(Q&A 카드가 published 로 확정된 시점)을 담는 전용 컬럼이 없어
--   검수일이 cards.updated_at 에만 섞여 저장되고, 기계적 수정(예: bold 일괄 스크립트)에
--   덮이는 문제가 있었음. reviewed_at 을 SSOT 로 신설.
--
-- 표시 규칙(애플리케이션): 표시·정렬 기준일 = COALESCE(reviewed_at, created_at).
--   - Q&A: reviewed_at(검수일)
--   - post(끄적끄적): reviewed_at = NULL → created_at 사용
--
-- 백필 규칙(Q&A published 한정):
--   (1) 3월까지 콘텐츠(영상 upload_date < 2026-04-01): reviewed_at = 영상 게시일(KST 자정)
--   (2) 4월 이후 + bold 일괄수정(2026-05-31 09:00~09:30 UTC)으로 updated_at 이 덮인 카드:
--        reviewed_at = created_at(발행일 근사 — 검수일 손실분의 최선 근사)
--   (3) 4월 이후 + 위에 해당 안 됨: reviewed_at = updated_at(진짜 검수일)
--   post / 미발행(draft·pending_review) Q&A: reviewed_at = NULL 유지(아직 검수 안 됨).
--
-- 트리거 주의(중요): cards 에는 cards_set_updated_at(BEFORE UPDATE) 트리거가 있어 UPDATE 마다
--   updated_at = now() 로 자동 갱신됨. 백필을 여러 UPDATE 로 쪼개면 앞 UPDATE 가 updated_at 을
--   now() 로 덮어 뒤 UPDATE 의 CASE 분기가 어긋남. 따라서 반드시 단일 UPDATE + CASE 로 처리한다
--   (단일 UPDATE 는 각 row 의 reviewed_at 을 그 row 의 "현재" updated_at 으로 계산하고, 트리거의
--   updated_at 갱신은 그 이후에 일어나므로 안전).
--
-- 실행 이력: production 은 본 파일과 동치(같은 결과)로 적용 완료(2026-06-01). 단 최초 적용은
--   쪼갠 UPDATE 로 실행되어 일부(4월이후 15건)가 now() 로 잘못 들어갔고 즉시 created_at 으로 보정함.
--   본 파일은 깨끗한 DB 에서 1회 실행 시 올바른 결과를 내는 정합 버전이다.

-- 1) 컬럼 추가
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.cards.reviewed_at IS
  '의료 검토일(SSOT). Q&A=의사 검수 확정 시각, post=NULL. 표시·정렬은 COALESCE(reviewed_at, created_at).';

-- 2) 백필 (Q&A published) — 단일 UPDATE + CASE (트리거 안전)
UPDATE public.cards c
SET reviewed_at = CASE
  WHEN v.upload_date < DATE '2026-04-01'
    THEN ((v.upload_date::text) || ' 00:00:00+09')::timestamptz
  WHEN c.updated_at >= TIMESTAMPTZ '2026-05-31 09:00:00+00'
       AND c.updated_at <  TIMESTAMPTZ '2026-05-31 09:30:00+00'
    THEN c.created_at
  ELSE c.updated_at
END
FROM public.videos v
WHERE c.video_id = v.id
  AND c.type = 'qa' AND c.status = 'published' AND c.deleted_at IS NULL
  AND v.upload_date IS NOT NULL;
