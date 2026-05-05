-- =============================================================
-- 0012. profiles / doctor_accounts 테이블 GRANT 누락 보완
--
-- 0010에서 RLS 정책은 작성했으나 테이블 레벨 GRANT를 빠뜨려
-- "permission denied for table profiles" 발생.
-- Postgres는 RLS 검사 이전에 테이블 GRANT를 먼저 확인함.
-- =============================================================

grant select, update on public.profiles to authenticated;
grant select on public.doctor_accounts to authenticated;
