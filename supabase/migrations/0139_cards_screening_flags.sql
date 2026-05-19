-- 0139_cards_screening_flags.sql (2026-05-19, 보안 2.5차 E묶음)
--
-- 콘텐츠 자동 검수기 v1 — 의료광고·약사법·환자후기 의심 패턴 잡힌 경우
-- 어떤 사유로 잡혔는지 admin 검토를 위해 저장.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS screening_flags text[] DEFAULT NULL;

COMMENT ON COLUMN public.cards.screening_flags IS
  '콘텐츠 자동 검수기에 잡힌 사유 키 목록 (보안 2.5차). 빈 배열/NULL = 통과';

-- pending_review 상태 카드를 빠르게 조회하기 위한 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_cards_pending_review_created
  ON public.cards(created_at DESC)
  WHERE status = 'pending_review';
