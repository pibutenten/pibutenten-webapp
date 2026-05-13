-- =============================================================
-- 0048. Phase 9 — RPC 함수 재작성 (profile_identities 의존 제거)
--
-- 0047에서 profile_identities → profiles 이관 완료. 이제 RPC도 새 모델 적용:
--   - p_identity_id (매개변수명 유지, 의미는 profile.id)
--   - profiles 테이블에서 직접 검증 (auth_user_id = auth.uid() 묶음인지)
--   - qa_likes/qa_saves PK는 (qa_id, user_id) — user_id 단독으로 unique
--
-- "identity not found" 에러 해결: profile_identities 'primary' lookup이
-- 사라지고, 클라이언트가 보낸 profile.id를 그대로 사용.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- toggle_qa_like
-- ─────────────────────────────────────────────────────────────
create or replace function public.toggle_qa_like(
  p_qa_id integer,
  p_identity_id uuid default null
)
returns table(liked boolean, like_count integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_auth uuid;
  v_profile_id uuid;
  v_count int;
  v_liked boolean;
begin
  v_auth := auth.uid();
  if v_auth is null then
    raise exception 'not authenticated';
  end if;

  -- 활성 profile.id 결정 — 클라이언트가 보낸 값을 검증
  -- p_identity_id가 NULL이면 auth user 본인 profile (primary), 있으면 그 묶음 멤버인지 확인
  if p_identity_id is null then
    v_profile_id := v_auth;
  else
    select p.id into v_profile_id
      from public.profiles p
     where p.id = p_identity_id
       and p.auth_user_id = v_auth
     limit 1;
    if v_profile_id is null then
      -- 묶음 멤버가 아니거나 존재하지 않음 — 보안상 본인 auth profile로 fallback
      v_profile_id := v_auth;
    end if;
  end if;

  if exists (select 1 from public.qa_likes where qa_id = p_qa_id and user_id = v_profile_id) then
    delete from public.qa_likes where qa_id = p_qa_id and user_id = v_profile_id;
    v_liked := false;
  else
    insert into public.qa_likes (qa_id, user_id)
      values (p_qa_id, v_profile_id)
      on conflict do nothing;
    v_liked := true;
  end if;

  select q.like_count into v_count from public.qas q where q.id = p_qa_id;
  return query select v_liked, coalesce(v_count, 0);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- toggle_qa_save
-- ─────────────────────────────────────────────────────────────
create or replace function public.toggle_qa_save(
  p_qa_id bigint,
  p_identity_id uuid default null
)
returns table(saved boolean, save_count integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_auth uuid;
  v_profile_id uuid;
  v_count int;
  v_saved boolean;
begin
  v_auth := auth.uid();
  if v_auth is null then
    raise exception 'not authenticated';
  end if;

  if p_identity_id is null then
    v_profile_id := v_auth;
  else
    select p.id into v_profile_id
      from public.profiles p
     where p.id = p_identity_id
       and p.auth_user_id = v_auth
     limit 1;
    if v_profile_id is null then
      v_profile_id := v_auth;
    end if;
  end if;

  if exists (select 1 from public.qa_saves where qa_id = p_qa_id and user_id = v_profile_id) then
    delete from public.qa_saves where qa_id = p_qa_id and user_id = v_profile_id;
    v_saved := false;
  else
    insert into public.qa_saves (qa_id, user_id)
      values (p_qa_id, v_profile_id)
      on conflict do nothing;
    v_saved := true;
  end if;

  select q.save_count into v_count from public.qas q where q.id = p_qa_id;
  return query select v_saved, coalesce(v_count, 0);
end;
$$;

-- 검증
select 'OK' as status;
