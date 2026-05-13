-- =============================================================
-- 0057. search_logs INSERT 권한 — 검색 기록 누락 해결
--
-- 증상: /admin 대시보드 "인기 검색어"가 항상 0건.
-- 원인: search_logs는 RLS 활성이지만 anon·authenticated INSERT policy 없음
--       → src/app/search/page.tsx의 insert가 silent fail.
-- 해결: anon·authenticated에 INSERT 권한 + RLS policy 추가.
--       (SELECT는 admin만, INSERT는 모두 — 운영 로그 수집용)
-- =============================================================

grant insert on public.search_logs to anon, authenticated;

drop policy if exists "search_logs: anyone insert" on public.search_logs;
create policy "search_logs: anyone insert"
  on public.search_logs for insert
  to anon, authenticated
  with check (true);

-- SELECT는 admin profile에 한정 (운영 통계용)
drop policy if exists "search_logs: admin select" on public.search_logs;
create policy "search_logs: admin select"
  on public.search_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'admin'
    )
  );

-- service_role은 항상 통과 (RPC SECURITY DEFINER 우회)
grant select on public.search_logs to service_role;

select 'OK' as status;
