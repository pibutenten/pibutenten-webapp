-- ============================================================
-- 0284 award_points 임의 호출 권한 회수 (2026-06-14 보안 감사)
--
-- 배경 (docs/reports/2026-06-14-보안감사-종합보고서.md §2-2, P2-1):
--   public.award_points(p_user_id, p_action, p_points, ...) 는 SECURITY DEFINER 이며
--   proacl 이 PUBLIC(=X) + authenticated 에 EXECUTE 부여된 상태였음.
--   함수 내부에 auth.uid()/is_admin() 가드가 전혀 없고 p_user_id 를 그대로 신뢰 →
--   누구나(비로그인 anon 포함) supabase.rpc('award_points', {...}) 직접 호출로
--   자신·타인의 activity_score / level 임의 조작 가능 (데이터 무결성 침해).
--   현재는 포인트가 금전 가치 없어 P2 이나, 포인트몰·결제 도입 시 P0 로 격상.
--
-- 조치: PUBLIC / anon / authenticated 의 EXECUTE 회수.
--   service_role(+ owner postgres) 만 직접 호출 가능하도록 최소화.
--
-- 기능 영향 0 (적용 전 검증 완료):
--   - 앱 코드(src) 직접 호출처 없음 (내부 헬퍼 전용).
--   - 유일한 내부 호출자 award_daily_login 은 SECURITY DEFINER →
--     owner 권한으로 실행되므로 award_points 호출 정상 유지.
--   - 좋아요/저장/일일로그인 등 적립 트리거·RPC 는 전부 definer 경로 → 영향 없음.
--
-- 참고: SECURITY.md §향후 점검 권고 "임의 호출 가능 RPC 점검" 의 잔여 미정리분.
--   (0274 recalc_user_level, 0276 find_other_auth_user_by_email 에 이어 정리)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.award_points(uuid, text, numeric, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, text, numeric, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, text, numeric, text, text, integer) FROM authenticated;

-- 검증: proacl 에 {postgres=X, service_role=X} 만 남아야 함 (=X / authenticated=X 소거).
-- SELECT proname, proacl::text FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND proname='award_points';
