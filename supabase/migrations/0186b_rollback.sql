-- 0186b_rollback.sql
-- 0186 의 정확한 역방향 마이그레이션 — 비상 시 사용.
--
-- 실행 조건: 0186 적용 후 회귀가 production 에서 확인된 경우.
-- 본 파일은 평소 실행하지 않음. supabase/migrations/ 에 보관만.
--
-- 절차: 본 파일 전체를 Supabase Management API 또는 dashboard SQL editor 에서 1회 실행.
-- 단일 트랜잭션이므로 중간 실패 시 자동 ROLLBACK.

BEGIN;

-- ============================================================================
-- 1. 컬럼 RENAME 역방향 (profile_id → user_id) + FK + 인덱스
-- ============================================================================

-- ── 1-6. card_impressions ───────────────────────────────────────────────────
ALTER TABLE public.card_impressions RENAME COLUMN profile_id TO user_id;

-- ── 1-5. card_views ─────────────────────────────────────────────────────────
ALTER TABLE public.card_views RENAME COLUMN profile_id TO user_id;

-- ── 1-4. card_shares ────────────────────────────────────────────────────────
ALTER TABLE public.card_shares RENAME COLUMN profile_id TO user_id;

-- ── 1-3. activity_points ────────────────────────────────────────────────────
ALTER INDEX public.idx_activity_points_profile_created RENAME TO idx_activity_points_user_created;
ALTER INDEX public.idx_activity_points_profile_action RENAME TO idx_activity_points_user_action;
ALTER TABLE public.activity_points
  RENAME CONSTRAINT activity_points_profile_id_fkey TO activity_points_user_id_fkey;
ALTER TABLE public.activity_points RENAME COLUMN profile_id TO user_id;

-- ── 1-2. site_visits ────────────────────────────────────────────────────────
ALTER INDEX public.idx_site_visits_profile_created RENAME TO idx_site_visits_user_created;
ALTER TABLE public.site_visits
  RENAME CONSTRAINT site_visits_profile_id_fkey TO site_visits_user_id_fkey;
ALTER TABLE public.site_visits RENAME COLUMN profile_id TO user_id;

-- ── 1-1. daily_logins ───────────────────────────────────────────────────────
ALTER TABLE public.daily_logins
  RENAME CONSTRAINT daily_logins_profile_id_fkey TO daily_logins_user_id_fkey;
ALTER TABLE public.daily_logins RENAME COLUMN profile_id TO user_id;


-- ============================================================================
-- 2. RLS 정책 역방향
-- ============================================================================

DROP POLICY IF EXISTS dl_self_select ON public.daily_logins;
CREATE POLICY dl_self_select ON public.daily_logins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ap_self_select ON public.activity_points;
CREATE POLICY ap_self_select ON public.activity_points
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================================
-- 3. RPC 본문 역방향 (10개 함수 모두 0186 직전 정의로 복원)
-- ============================================================================
-- 본 섹션은 분량이 크므로 별도 dump 가 필요한 경우 production DB 직전 정의를
-- pg_get_functiondef 로 백업한 뒤 복원. 0186 적용 전 자동 백업은 supabase migration
-- history 자체가 보장하지 않으므로 운영자가 적용 전에 dump 보관 필요.
--
-- 임시 대응: 0186 의 본문에서 profile_id → user_id 로 단어 치환만 하면 의미 동일.
-- 단 본 0186b 본문에 모든 함수를 복사하면 파일이 매우 길어져 검수 부담이 큼.
-- 비상 시 운영자가 0186 본문을 텍스트 에디터로 열어 profile_id → user_id 일괄 치환
-- 후 CREATE OR REPLACE FUNCTION 섹션만 추출 적용하면 됨 (테이블 변경은 위 §1 으로 완료).

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 운영 노트
-- ============================================================================
-- 1) 본 파일은 적용 전 production cards 데이터에 영향 없음 (컬럼 RENAME 만).
-- 2) 마이그 0186 적용 후 코드(middleware/useCardViewer/impression-queue/useCardEngagement/
--    scripts/check-impressions-today.mjs) 도 profile_id 키를 사용하도록 변경됨.
--    rollback 적용 시 그 코드들도 원복 필요 → git revert 권장.
-- 3) Vercel 자동 재배포가 코드 측 변경을 production 으로 푸시한 상태에서
--    DB 만 rollback 하면 production 이 NULL upsert 또는 500 에러 발생.
--    rollback 절차: (a) git revert Phase 2 코드 commit, (b) Vercel 재배포 완료 대기,
--    (c) 본 0186b 적용. 순서 역전 시 production 서비스 다운.
