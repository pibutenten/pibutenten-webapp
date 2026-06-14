-- ============================================================
-- 0285 award_daily_login 임의 호출 권한 회수 (2026-06-14 보안 감사 후속)
--
-- 배경: 0284(award_points REVOKE) 검토 중 supabase-specialist 가 발견한
--   동일 부류 우회 경로.
--   public.award_daily_login(p_user_id uuid) 는 SECURITY DEFINER 이며
--   proacl 에 PUBLIC/authenticated EXECUTE 부여 + 내부에서
--   `v_user := COALESCE(p_user_id, auth.uid())` 로 파라미터를 무검증 신뢰 →
--   authenticated/anon 이 타인 profile_id 를 p_user_id 로 넘겨
--   타인의 daily_logins 기록 + activity_score 적립 가능(데이터 무결성).
--   이 함수가 award_points 의 유일한 내부 호출자이므로, 0284 로 award_points 를
--   잠가도 award_daily_login 직접 호출이라는 옆문이 남아 있었음 → 한 세트로 봉쇄.
--
-- 조치: PUBLIC / anon / authenticated 의 EXECUTE 회수.
--   service_role(+ owner postgres) 만 직접 호출 가능.
--
-- 기능 영향 0 (적용 전 3중 검증 완료):
--   - 앱 코드(src) 직접 호출처 없음 (grep 0건).
--   - pg_trigger 등록 없음 (트리거 함수 아님).
--   - 다른 DB 함수 본문에서 호출 없음 (award_daily_login 은 현재 미사용 dead 함수).
--   → 호출 경로가 전무하므로 REVOKE 로 회귀 위험 없음. (일일 로그인 적립 기능을
--     재가동하려면 별도 안건에서 service_role 호출 또는 본문에 소유권 가드 추가로 설계)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.award_daily_login(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_daily_login(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_daily_login(uuid) FROM authenticated;

-- 검증: 적용 결과 proacl = {postgres=X} (owner only).
--   award_daily_login 은 원래 service_role 명시 GRANT 없이 PUBLIC 경유로만 실행
--   가능했어서, PUBLIC 회수 시 service_role 도 함께 소거됨. 미사용 함수라 무방
--   (재가동 시 GRANT EXECUTE ... TO service_role 명시 부여).
-- SELECT proname, proacl::text FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND proname='award_daily_login';
