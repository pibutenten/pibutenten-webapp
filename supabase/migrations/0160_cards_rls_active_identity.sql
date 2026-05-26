-- 0160: cards RLS 정책 active 단위 재작성 (2026-05-26)
--
-- ADR 0001 원칙 정합 — Phase 2/3 (가) 안:
--   "권한은 현재 active 신분 단위 — 묶음 합산 X"
--
-- 변경 정책 (cards):
--   cards_owner_update (0155): author_id IN same_group → author_id = active
--   cards_owner_delete (0155): 동일
--   cards_user_own_post (UPDATE, authenticated): 동일
--   cards_user_own_post_delete (DELETE, authenticated): 동일
--   cards_user_post_insert (INSERT, 3중 OR): author_id IN same_group → author_id = active
--
-- 안전망 (회귀 0):
--   `COALESCE(current_active_profile_id(), auth.uid())` — 헤더 미설정 레거시
--   호출자도 primary profile.id 기준으로 정상 동작.
--   클라이언트 (server.ts / client.ts) 가 cookie 의 active 를 헤더로 전송하면
--   active profile.id 가 사용됨 — 사용자 정책 정합.
--
-- 미변경 정책 (의도):
--   cards_admin_all: is_admin() — is_admin 함수 자체가 active 인식하도록 0159 에서 교체
--   cards_doctor_update/delete: doctor_id = current_doctor_id() — 동일
--   cards_open_all_to_auth (UPDATE, USING/CHECK true): 검토 결과 보안 구멍.
--     PERMISSIVE 라 모든 authenticated UPDATE 통과 → owner/doctor 정책 의미 무력화.
--     본 마이그레이션에서 DROP — owner/doctor 정책으로 충분.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. 보안 구멍 제거 — cards_open_all_to_auth DROP
--    (USING=true / WITH CHECK=true / PERMISSIVE 라 모든 정책 무력화하던 정책)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_open_all_to_auth ON public.cards;

-- ─────────────────────────────────────────────────────────────────────
-- 2. cards_owner_update — active 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_owner_update ON public.cards;
CREATE POLICY cards_owner_update ON public.cards
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. cards_owner_delete — active 단위
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_owner_delete ON public.cards;
CREATE POLICY cards_owner_delete ON public.cards
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. cards_user_own_post — UPDATE, authenticated role, type='post' 제약 + active
--    (0099 RLS rewrite 패턴 유지 + same_group → active)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_user_own_post ON public.cards;
CREATE POLICY cards_user_own_post ON public.cards
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND type = 'post'::qa_type
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND type = 'post'::qa_type
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 5. cards_user_own_post_delete — DELETE
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_user_own_post_delete ON public.cards;
CREATE POLICY cards_user_own_post_delete ON public.cards
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND type = 'post'::qa_type
    AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. cards_user_post_insert — INSERT WITH CHECK
--    3중 OR 분기 모두 active 단위:
--      a) type='post' + author_id=active + doctor_id IS NULL (일반 회원 글)
--      b) is_admin() (0159 에서 active 인식)
--      c) doctor_id = current_doctor_id() (0159 에서 active 인식)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cards_user_post_insert ON public.cards;
CREATE POLICY cards_user_post_insert ON public.cards
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (
        type = 'post'::qa_type
        AND author_id = COALESCE(public.current_active_profile_id(), auth.uid())
        AND doctor_id IS NULL
      )
      OR public.is_admin()
      OR (doctor_id = public.current_doctor_id())
    )
  );

-- 검증: UPDATE/DELETE/INSERT 정책 목록
SELECT polname, polcmd, polpermissive
FROM pg_policy
WHERE polrelid = 'public.cards'::regclass
ORDER BY polcmd, polname;

COMMIT;
