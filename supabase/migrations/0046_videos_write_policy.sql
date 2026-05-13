-- =============================================================
-- 0046. videos 테이블 쓰기 권한 — admin INSERT/UPDATE 허용
--
-- 배경: 0001 init에서 videos는 SELECT만 허용 (anon·authenticated read).
--       발행 API(/api/admin/draft/publish)가 youtube_id 기준 UPSERT 시도 →
--       "permission denied for table videos" 에러.
--
-- 해결: admin role 또는 developer role을 가진 사용자만 INSERT/UPDATE 가능.
-- =============================================================

-- 1. GRANT — authenticated role에 INSERT/UPDATE 권한
grant insert, update on public.videos to authenticated;

-- 2. RLS 정책 — admin/developer만 쓰기 가능
drop policy if exists "videos: admin insert" on public.videos;
create policy "videos: admin insert"
  on public.videos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'developer')
    )
  );

drop policy if exists "videos: admin update" on public.videos;
create policy "videos: admin update"
  on public.videos for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'developer')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'developer')
    )
  );

-- 검증
select 'OK' as status, count(*) as videos_count from public.videos;
