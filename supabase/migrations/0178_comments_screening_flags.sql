-- 0178. comments.screening_flags 컬럼 추가 (2026-05-28)
--
-- 배경: 댓글에도 카드와 동일한 콘텐츠 자동검수(의료법 §56② 14금지 + 약사법 §68 + 환자후기) 적용.
-- 회원 댓글이 임계점 5 초과 시 status='hidden' (카드의 pending_review 와 의미상 대응) + flags 저장.
-- admin 검토 시 사유 추적용. ADR 0007 (검수기 v1) 정합.
--
-- 카드 측 cards.screening_flags 패턴 (0148 등) 과 동일 형식: text[] nullable.

BEGIN;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS screening_flags text[] NULL;

COMMENT ON COLUMN public.comments.screening_flags IS
  '회원 댓글 자동검수 사유 키 배열 (예: patient_testimonial, comparison_ad 등). NULL=검사 통과 또는 의사/관리자 작성. 0178.';

NOTIFY pgrst, 'reload schema';

COMMIT;
