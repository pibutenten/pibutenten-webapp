-- 0132: cards 테이블 soft-delete 도입 (2026-05-18)
--
-- 배경:
--   현재 Card.tsx 의 ⋮ → 삭제 누르면 cards 테이블 hard DELETE. soft-delete 컬럼 없어
--   실수 한 번 = 영구 손실. 김종식 원장님 "수염 제모" 카드처럼 백업에서 수동 복구해야.
--
-- 전략:
--   1) cards.deleted_at TIMESTAMPTZ 컬럼 추가
--   2) cards_public_read RLS 정책에 `deleted_at IS NULL` 조건 강제
--      (admin 은 is_admin() 분기로 deleted 도 볼 수 있게 — 복구 UI 용)
--   3) 부분 인덱스: 살아있는 카드(deleted_at IS NULL) 조회 가속
--
--   → app 레벨 35개 SELECT 쿼리 수정 불필요. RLS 가 강제.
--   → admin 화면(cards_admin_all 정책으로 모든 row 접근) 만 deleted 가시.
--
-- Card.tsx 의 삭제 동작은 별도 코드 변경에서 .delete() → .update({deleted_at: now()}) 로 전환.

BEGIN;

-- 1. 컬럼 추가 (NULL 허용, default 없음 = 기존 row 는 NULL 로 유지 = 살아있음)
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cards.deleted_at IS
  'soft-delete 시각. NULL = 살아있는 카드. NOT NULL = 사용자가 삭제 (실제 DB row 는 남아 있음, 복구용)';

-- 2. 부분 인덱스 — 살아있는 카드 정렬·필터 가속.
--    피드/검색/프로필 페이지가 모두 deleted_at IS NULL + ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_cards_not_deleted_created
  ON public.cards (created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. RLS 정책 갱신 — cards_public_read 에 deleted_at IS NULL 강제.
--    admin (is_admin()) 은 deleted 도 통과 (관리 화면 복구 UI 용).
DROP POLICY IF EXISTS cards_public_read ON public.cards;
CREATE POLICY cards_public_read
  ON public.cards
  FOR SELECT
  USING (
    is_admin()
    OR (
      deleted_at IS NULL
      AND (
        status = 'published'::qa_status
        OR (auth.uid() IS NOT NULL AND doctor_id = current_doctor_id())
        OR (
          auth.uid() IS NOT NULL
          AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
        )
      )
    )
  );

-- 4. 검증
SELECT
  (SELECT count(*) FROM public.cards WHERE deleted_at IS NULL) AS alive_count,
  (SELECT count(*) FROM public.cards WHERE deleted_at IS NOT NULL) AS deleted_count;

COMMIT;
