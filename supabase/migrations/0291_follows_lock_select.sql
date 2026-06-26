-- 0291_follows_lock_select.sql
-- 0290 후속 정정 (2026-06-27 검수 후속). follows 접근을 RPC-only 로 확정.
--
-- 배경: 0290 의 `follows_select_public` RLS 정책(USING true)은 anon/authenticated 에 SELECT GRANT 가
--   부여되지 않아 PostgREST 직접 .from("follows").select() 가 어차피 권한오류로 막히는 '죽은 정책'이었다.
--   클라 코드는 follows 를 직접 SELECT 하지 않고 RPC(get_my_follow / toggle_follow, 둘 다 SECURITY DEFINER)
--   만 쓴다(grep .from("follows") 0건). 또한 who-follows-whom 의 공개 직접 열람은 프라이버시상 막는 게 낫다.
-- 조치: 죽은 정책 제거 → RLS enabled + 정책 0 = 직접 접근 deny, 오직 SECURITY DEFINER RPC 만 허용(의도=실제 일치).
--   팔로워 수·내 팔로우 여부는 get_my_follow(count·EXISTS)가 통제 노출. 향후 '팔로워 목록'도 전용 RPC 로.

BEGIN;
DROP POLICY IF EXISTS follows_select_public ON public.follows;
COMMIT;

SELECT 'OK 0291' AS status;
