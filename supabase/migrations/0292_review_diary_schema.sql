-- 0292_review_diary_schema.sql
-- 후기·시술일기 통합 Phase 1 — DB 토대 (1/2)
-- 정본 계획서 §2.1 (review-diary-unification-master-plan.md) DDL 그대로.
-- 묶음: diaries 7컬럼 확장 + procedure_reviews 7컬럼 확장 + NOT NULL 4종 완화
--       + 정합 CHECK 2종 + 660건 백필(FIX-2) + read_public 교체(is_public 게이트)
--       + diaries_delete_own 정책 제거(FIX-1) + 인덱스 3종.
-- 한 트랜잭션·동시 배포. ADD/ALTER/DROP POLICY/CREATE 만 — 파괴적 작업 없음.

BEGIN;

-- (1) diaries 확장. 기존 70행 무변경(개명·복사 안 함).
ALTER TABLE diaries
  ADD COLUMN clinic_home  text,
  ADD COLUMN clinic_kakao text,
  ADD COLUMN total_price  int     CHECK (total_price IS NULL OR total_price >= 0),
  ADD COLUMN is_complete  boolean NOT NULL DEFAULT true,
  ADD COLUMN reminder_stage smallint NOT NULL DEFAULT 0,
  ADD COLUMN reminder_muted boolean  NOT NULL DEFAULT false,
  ADD COLUMN visited_on_precision text NOT NULL DEFAULT 'exact'
    CHECK (visited_on_precision IN ('exact','season','half','year'));

-- (2) procedure_reviews 연결/유형 + recommend(신규 결론칸).
ALTER TABLE procedure_reviews
  ADD COLUMN recommend smallint CHECK (recommend IS NULL OR (recommend >= 1 AND recommend <= 5)),
  ADD COLUMN visit_id  bigint REFERENCES diaries(id)           ON DELETE SET NULL,
  ADD COLUMN diary_procedure_id bigint REFERENCES diary_procedures(id) ON DELETE SET NULL,
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN date_precision text NOT NULL DEFAULT 'exact'
    CHECK (date_precision IN ('exact','season','half','year')),
  ADD COLUMN source text NOT NULL DEFAULT 'standalone'
    CHECK (source IN ('standalone','diary_linked')),
  ADD COLUMN solo_price int CHECK (solo_price IS NULL OR solo_price >= 0);

-- (3) NOT NULL 완화. 기존 666행은 값 보유라 무영향.
ALTER TABLE procedure_reviews
  ALTER COLUMN card_id      DROP NOT NULL,
  ALTER COLUMN satisfaction DROP NOT NULL,
  ALTER COLUMN pain         DROP NOT NULL,
  ALTER COLUMN revisit      DROP NOT NULL;

-- (3b) 정합 가드 CHECK (§1.3.3, D-E).
ALTER TABLE procedure_reviews
  ADD CONSTRAINT procedure_reviews_public_needs_card
    CHECK (is_public = false OR card_id IS NOT NULL),
  ADD CONSTRAINT procedure_reviews_source_link_chk
    CHECK ( (source = 'diary_linked' AND visit_id IS NOT NULL)
         OR (source = 'standalone'   AND visit_id IS NULL) );

-- (4) 백필 — 기존 666건 중 카드 살아있는 660건만 is_public=true (FIX-2).
--     ★백필을 RLS 교체보다 먼저(원자 순서).
--     ★주의(FIX-2): 666건 중 6건(review_id 27·28·59·61·67·510)은 카드 status='published'이나
--       deleted_at IS NOT NULL(soft-deleted). card_id IS NOT NULL 만으로 좁히면 이 6건도
--       is_public=true 가 되어 "is_public=true 인데 카드 soft-deleted" 불일치(unpublish 모델의 역)가
--       생긴다. 누출·집계오염은 없으나(read_public·집계 모두 deleted_at IS NULL JOIN 으로 배제)
--       상태 모순을 피하려 EXISTS(살아있는 카드) 까지 요구해 660건만 공개로 둔다(6건은 is_public=false 유지).
UPDATE procedure_reviews
   SET is_public      = true,
       source         = 'standalone',
       date_precision = 'exact'
 WHERE card_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM cards c
      WHERE c.id = procedure_reviews.card_id
        AND c.deleted_at IS NULL
   );   -- = 660건(soft-deleted 카드 6건 제외, FIX-2)

-- (5) 인덱스.
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_visit
  ON procedure_reviews(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_diary_proc
  ON procedure_reviews(diary_procedure_id) WHERE diary_procedure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_public
  ON procedure_reviews(procedure_ko) WHERE is_public = true AND card_id IS NOT NULL;

-- (6) ★회귀 가드 #1 — read_public 에 is_public 명시(심층 방어).
DROP POLICY procedure_reviews_read_public ON procedure_reviews;
CREATE POLICY procedure_reviews_read_public ON procedure_reviews
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND card_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cards c
       WHERE c.id = procedure_reviews.card_id
         AND c.status = 'published'
         AND c.deleted_at IS NULL
    )
  );

-- (7) ★일기 삭제를 delete_visit RPC 전용으로 강등 — diaries_delete_own RLS 정책 제거(FIX-1).
--     라이브 확인: diaries 에 owner-only FOR DELETE 정책 diaries_delete_own
--       (qual: profile_id = COALESCE(current_active_profile_id(), auth.uid()))이 현재 활성.
--     이 정책이 살아 있으면 클라이언트가 supabase.from("diaries").delete() 로 SECURITY DEFINER
--     delete_visit RPC(§3.4·D-I)를 우회 가능 → diary_linked 후기가 붙은 일기에서
--     source_link_chk × ON DELETE SET NULL 함정(D-I)이 재현되거나, 후기 standalone 전환·
--     트랙 A(review_checkin) 예약 회수 없이 연결만 끊긴다. 따라서 raw DELETE 차단·delete_visit
--     강제의 DB레벨 전제로 이 정책을 제거하고, 일기 삭제는 delete_visit RPC 전용으로 강등한다.
--     (INSERT/UPDATE/SELECT owner-only 3종은 무변경 — DELETE 경로만 RPC 로 일원화.)
DROP POLICY IF EXISTS diaries_delete_own ON diaries;

COMMIT;
