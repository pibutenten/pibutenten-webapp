-- =============================================================
-- 0052. get_recent_likers RPC 재작성 — Phase 9 단일 profiles 모델
--
-- 이전: profile_identities JOIN (identity_id 기반)
-- 변경: profiles JOIN (user_id = profiles.id), doctor 매핑은 doctors.photo_url
-- =============================================================

create or replace function public.get_recent_likers(
  p_qa_id bigint,
  p_limit int default 5
)
returns table(
  user_id uuid,
  persona text,
  display_name text,
  avatar_url text,
  handle text,
  created_at timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    l.user_id,
    l.persona::text,
    p.display_name,
    -- doctor 매핑된 row면 doctors.photo_url 우선 (single source)
    coalesce(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) as avatar_url,
    p.handle,
    l.created_at
  from public.qa_likes l
  join public.profiles p on p.id = l.user_id
  left join public.doctor_accounts da on da.profile_id = p.id
  left join public.doctors d on d.id = da.doctor_id
  where l.qa_id = p_qa_id
  order by l.created_at desc
  limit p_limit;
$$;

-- 검증
select 'OK' as status, count(*) as recent_likers
from public.get_recent_likers(1, 5);
