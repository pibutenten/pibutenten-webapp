-- 기존 사용자에게 임시 handle 부여 — 'u-XXXXXX' (5-6자 base32 lowercase).
-- 사용자가 나중에 프로필 편집에서 본인이 원하는 handle로 변경 가능.
-- 신규 가입자도 자동 부여 — handle_new_user trigger 보강.

create or replace function public._gen_random_handle(prefix text default 'u')
returns text
language plpgsql
as $$
declare
  alphabet text := '123456789abcdefghijkmnpqrstuvwxyz';
  candidate text;
  i int;
  taken boolean;
begin
  for try_num in 1..10 loop
    candidate := prefix;
    if length(candidate) > 0 then candidate := candidate || '-'; end if;
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.profiles where handle = candidate or alt_handle = candidate)
       or exists(select 1 from public.reserved_handles where handle = candidate)
      into taken;
    if not taken then return candidate; end if;
  end loop;
  raise exception 'handle generation failed (10 collisions)';
end;
$$;

-- 모든 NULL handle 사용자에게 일괄 부여
update public.profiles
   set handle = public._gen_random_handle('u')
 where handle is null;

-- 신규 가입자도 자동 부여 — handle_new_user trigger 보강
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, public._gen_random_handle('u'))
  on conflict (id) do nothing;
  return new;
end;
$$;
