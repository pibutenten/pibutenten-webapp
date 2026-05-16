-- 0096: profiles.avatar_bg_color 컬럼 폐기
-- 결정 (2026-05-16): 표시 측 6곳(Card, TopNav, CommentsBlock, [handle], ProfileEdit, 알림)에서 미사용,
-- onboarding 폼에서도 이미 색 선택 UI 제거 후 항상 null로 저장 중이었음 (죽은 기능).
-- 사전 조사: NOT NULL row 1개뿐. 데이터 유실 영향 무시 가능.
--
-- 코드 변경 (선행 commit):
--   - src/app/onboarding/page.tsx, OnboardingClient.tsx에서 컬럼 SELECT/INSERT 모두 제거

BEGIN;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_bg_color;

COMMIT;

SELECT 'OK 0096' AS status;
