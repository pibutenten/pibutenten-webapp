-- 신규 가입 시 id(handle) 생성 전략 강화:
--   1) email local part(@ 앞부분) 정규화 → handle 후보
--   2) 이미 사용 중이거나 reserved이면 -1, -2, ..., -99 변형 시도
--   3) 모두 실패하면 'u-XXXXXX' 랜덤 fallback
-- 예: hhskin00@gmail.com → hhskin00 → (taken) → hhskin00-1 → (taken) → hhskin00-2

create or replace function public._handle_candidate_from_email(p_email text)
returns text
language plpgsql
as $$
declare
  base text;
begin
  if p_email is null or position('@' in p_email) < 2 then return ''; end if;
  base := lower(split_part(p_email, '@', 1));
  -- 영숫자·하이픈만 남김
  base := regexp_replace(base, '[^a-z0-9-]+', '-', 'g');
  -- 연속 하이픈 정리
  base := regexp_replace(base, '-+', '-', 'g');
  -- 양 끝 하이픈 제거
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  if length(base) < 3 then return ''; end if;
  if length(base) > 27 then base := substr(base, 1, 27); end if; -- -1~-99 suffix 자리 확보
  return base;
end;
$$;

create or replace function public._suggest_handle(p_email text)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  taken boolean;
  suffix int;
begin
  base := public._handle_candidate_from_email(p_email);
  -- email local part가 없거나 너무 짧으면 random fallback
  if base = '' then
    return public._gen_random_handle('u');
  end if;
  -- base 그대로 시도
  candidate := base;
  for suffix in 0..99 loop
    if suffix > 0 then candidate := base || '-' || suffix; end if;
    select exists(
      select 1 from public.profiles
       where handle = candidate or alt_handle = candidate
    ) or exists(
      select 1 from public.reserved_handles where handle = candidate
    ) into taken;
    if not taken then return candidate; end if;
  end loop;
  -- 100회 시도 모두 실패 → random fallback
  return public._gen_random_handle('u');
end;
$$;

-- handle_new_user trigger 갱신: email 기반 제안 우선
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, public._suggest_handle(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;
