-- 0301_run_diary_reminders_grant.sql
-- P4 예약 알림 발사 [치명] 권한 누락 보정 — run_diary_reminders() EXECUTE GRANT.
--
-- 배경(정정 사유):
--   0300_diary_reminders_engine.sql L166 주석은 "cron 라우트는 service_role 로 호출하므로
--   별도 GRANT 불필요" 라고 잘못 서술하고, L168 에서 `REVOKE ALL ... FROM PUBLIC` 만 수행했다.
--   그 결과 run_diary_reminders() 에 service_role EXECUTE 권한이 없는 상태로 production 에 적용됐다.
--   service_role 은 rolbypassrls=true 이지만 rolsuper=false 이므로, 함수 EXECUTE 는
--   명시 GRANT 가 있어야만 가능하다. (대조: 정상 동작하는 run_keyword_digest 는 0245 에서
--   service_role 에 EXECUTE GRANT 보유 → proacl 에 service_role=X.)
--   따라서 cron 라우트(src/app/api/cron/diary-reminders/route.ts, service_role 키로
--   supabase.rpc("run_diary_reminders") 호출)가 매 실행 `42501 permission denied for function`
--   으로 500 실패한다.
--
-- 보정:
--   service_role 에만 EXECUTE 부여(run_keyword_digest 와 동일 패턴). anon/authenticated/PUBLIC 은
--   계속 차단(0300 의 REVOKE 유지 + 본 마이그도 anon/authenticated 명시 REVOKE 로 재확인).
--   0300 파일 본문은 이미 production 적용됐으므로 수정하지 않고, 본 0301 에서 권한만 보정한다.
--
-- 무회귀: 권한 추가만 수행(함수 본문·시그니처·다른 객체 변경 없음). service_role 전용 유지라
--   외부 직접 호출 표면 증가 없음.

BEGIN;

-- service_role 전용 EXECUTE 부여. anon/authenticated/PUBLIC 은 차단 유지(재확인).
REVOKE ALL ON FUNCTION public.run_diary_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_diary_reminders() TO service_role;

COMMIT;

SELECT 'OK 0301' AS status;
