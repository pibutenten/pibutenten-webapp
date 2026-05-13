-- =============================================================
-- 0058. 관리자 대시보드 KPI RPC + qa_views / qa_shares 이벤트 테이블
--
-- KPI:
--   - 방문자(UV) / 페이지뷰(PV)  — qa_views 신규 테이블 + Vercel Analytics 병행
--   - 댓글 / 좋아요 / 저장 / 공유  — 모두 created_at 기반 기간 필터
-- =============================================================

-- 1. qa_views — 카드 조회 이벤트 (PV·UV 추적용)
create table if not exists public.qa_views (
  id bigserial primary key,
  qa_id bigint references public.qas(id) on delete cascade,
  user_id uuid,  -- 로그인 사용자면 profile.id, 비로그인이면 NULL
  session_id text,  -- 익명 세션 식별 (UV 카운트용)
  created_at timestamptz not null default now()
);
create index if not exists qa_views_created_at_idx on public.qa_views(created_at desc);
create index if not exists qa_views_qa_id_idx on public.qa_views(qa_id);

alter table public.qa_views enable row level security;

drop policy if exists "qa_views: anyone insert" on public.qa_views;
create policy "qa_views: anyone insert"
  on public.qa_views for insert
  to anon, authenticated
  with check (true);

drop policy if exists "qa_views: admin select" on public.qa_views;
create policy "qa_views: admin select"
  on public.qa_views for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'admin'
    )
  );

grant insert on public.qa_views to anon, authenticated;
grant select on public.qa_views to authenticated;

-- 2. qa_shares — 공유 이벤트
create table if not exists public.qa_shares (
  id bigserial primary key,
  qa_id bigint references public.qas(id) on delete cascade,
  user_id uuid,
  channel text,  -- 'link' | 'kakao' | 'twitter' | ...
  created_at timestamptz not null default now()
);
create index if not exists qa_shares_created_at_idx on public.qa_shares(created_at desc);

alter table public.qa_shares enable row level security;

drop policy if exists "qa_shares: anyone insert" on public.qa_shares;
create policy "qa_shares: anyone insert"
  on public.qa_shares for insert
  to anon, authenticated
  with check (true);

drop policy if exists "qa_shares: admin select" on public.qa_shares;
create policy "qa_shares: admin select"
  on public.qa_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'admin'
    )
  );

grant insert on public.qa_shares to anon, authenticated;
grant select on public.qa_shares to authenticated;

-- 3. RPC: 기간별 KPI 일괄 조회
create or replace function public.get_admin_kpi(p_days int default 7)
returns table(
  visitors bigint,
  views bigint,
  comments bigint,
  likes bigint,
  saves bigint,
  shares bigint
)
language sql
stable security definer
set search_path to 'public'
as $$
  with bounds as (
    select case when p_days is null or p_days = 0
                then '1970-01-01'::timestamptz
                else now() - (p_days || ' days')::interval
           end as since
  )
  select
    (select count(distinct coalesce(user_id::text, session_id))::bigint
      from public.qa_views v, bounds b
      where v.created_at >= b.since) as visitors,
    (select count(*)::bigint
      from public.qa_views v, bounds b
      where v.created_at >= b.since) as views,
    (select count(*)::bigint
      from public.comments c, bounds b
      where c.created_at >= b.since and c.status = 'visible') as comments,
    (select count(*)::bigint
      from public.qa_likes l, bounds b
      where l.created_at >= b.since) as likes,
    (select count(*)::bigint
      from public.qa_saves s, bounds b
      where s.created_at >= b.since) as saves,
    (select count(*)::bigint
      from public.qa_shares sh, bounds b
      where sh.created_at >= b.since) as shares;
$$;

grant execute on function public.get_admin_kpi(int) to authenticated;

select 'OK' as status;
