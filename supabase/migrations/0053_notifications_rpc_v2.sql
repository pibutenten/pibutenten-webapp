-- =============================================================
-- 0053. get_notifications RPC 재작성 — Phase 9 단일 profiles 모델
--
-- 이전: profile_identities JOIN (actor_identity_id)
-- 변경: profiles JOIN (actor_id = profiles.id), doctor 매핑은 doctors.photo_url
-- =============================================================

create or replace function public.get_notifications(
  p_offset int default 0,
  p_limit int default 30
)
returns table(
  id bigint,
  kind text,
  qa_id bigint,
  comment_id bigint,
  actor_id uuid,
  actor_display_name text,
  actor_avatar_url text,
  actor_handle text,
  qa_question text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $$
  select
    n.id,
    n.kind,
    n.qa_id,
    n.comment_id,
    n.actor_id,
    p.display_name as actor_display_name,
    coalesce(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) as actor_avatar_url,
    p.handle as actor_handle,
    q.question as qa_question,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.doctor_accounts da on da.profile_id = p.id
  left join public.doctors d on d.id = da.doctor_id
  left join public.qas q on q.id = n.qa_id
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  offset p_offset
  limit p_limit;
$$;

select 'OK' as status;
