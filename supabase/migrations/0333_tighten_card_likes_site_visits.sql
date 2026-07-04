-- 0333_tighten_card_likes_site_visits.sql
-- Phase 1-A / 자잘 보안 2건 (2026-07-04).
--
-- (1) card_likes SELECT 전체공개(qual=true) → 본인+관리자로 좁힘.
--     배경: card_likes_select 가 roles={public} qual=true 라 anon 포함 누구나
--       profile_id↔card_id 좋아요 그래프를 열거할 수 있었다(관심/건강 성향 노출).
--     안전성(회귀 없음, 실측 확인): 좋아요 소비 경로 3종이 모두 이 정책과 무관.
--       - 좋아요 여부 조회(viewer-states/useCardEngagement/reviews): 이미 .eq(profile_id)
--         본인 한정 → 좁혀도 통과.
--       - 좋아요 수: cards.like_count denormalized + card_likes_sync 트리거
--         (SECURITY DEFINER) 로 유지 → SELECT 정책 무관.
--       - 좋아요한 사람 목록: get_recent_card_likers_batch RPC(SECURITY DEFINER)
--         경유 → 직접 SELECT 아님.
--     card_saves_select 와 동일 패턴(TO authenticated + is_admin OR 본인)으로 통일.
--
-- (2) site_visits INSERT with_check(true) → 호출자 본인 묶음 프로필로 제한.
--     배경: site_visits_anon_insert 가 roles={public} with_check=true 라 anon 이
--       임의 방문 행을 위조해 KPI(방문자/리서치 패널)를 오염시킬 수 있었다.
--     수정: 삽입 행의 profile_id 가 호출자 본인 묶음일 때만 허용. auth.uid() 가
--       NULL(anon)이면 EXISTS 가 항상 거짓 → 익명 위조 차단. 로그인 사용자의
--       타인 명의 위조도 차단.
--     안전성(회귀 없음): 정상 적재는 middleware(로그인 사용자만, event.waitUntil
--       fail-safe)가 profile_id = 본인 active/base 명함으로 넣으므로 EXISTS 통과.
--       설령 실패해도 비블로킹이라 사용자 요청은 안 깨진다. session_id 등 나머지
--       컬럼은 제약하지 않는다. 정책명·roles(public) 는 종전 유지(익명 차단은 EXISTS 가 담당).

-- (1) card_likes — card_saves_select 와 동일 패턴으로 통일.
DROP POLICY IF EXISTS card_likes_select ON public.card_likes;
CREATE POLICY card_likes_select ON public.card_likes
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND profile_id = COALESCE(current_active_profile_id(), auth.uid())
    )
  );

-- (2) site_visits
DROP POLICY IF EXISTS site_visits_anon_insert ON public.site_visits;
CREATE POLICY site_visits_anon_insert ON public.site_visits
  FOR INSERT
  WITH CHECK (
    profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = site_visits.profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );
