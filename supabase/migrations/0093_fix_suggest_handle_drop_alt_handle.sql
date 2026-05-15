-- =============================================================
-- 0093. _suggest_handle: alt_handle 참조 제거 — 새 가입자 차단 fix
--
-- 증상:
--   /login 에서 Google / Kakao OAuth 후 'Database error saving new user'
--   기존 가입자는 영향 없음 (트리거는 새 user INSERT 시에만 발사)
--
-- 원인:
--   public._suggest_handle() 가 'profiles.alt_handle' 컬럼 참조하는데
--   profiles 테이블엔 alt_handle 컬럼이 없음 → 함수 실행 시 42703 에러
--   → handle_new_user 트리거 실패 → auth.users INSERT 롤백
--   → Supabase Auth 가 'Database error saving new user' 반환
--
-- fix:
--   _suggest_handle 함수에서 alt_handle 참조 제거.
--   handle UNIQUE 충돌은 base, base-1, base-2, ... base-99 retry 로 처리되며,
--   100회 실패 시 _gen_random_handle('u') 으로 random fallback.
-- =============================================================

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
  -- email local part 가 없거나 너무 짧으면 random fallback
  if base = '' or base is null then
    return public._gen_random_handle('u');
  end if;
  -- base 그대로 시도 + 100회 retry (base-1, base-2, ..., base-99)
  candidate := base;
  for suffix in 0..99 loop
    if suffix > 0 then candidate := base || '-' || suffix; end if;
    -- alt_handle 컬럼 부재 → 참조 제거. handle UNIQUE / reserved_handles 만 검사.
    select exists(
      select 1 from public.profiles where handle = candidate
    ) or exists(
      select 1 from public.reserved_handles where handle = candidate
    ) into taken;
    if not taken then return candidate; end if;
  end loop;
  -- 100회 시도 모두 실패 → random fallback
  return public._gen_random_handle('u');
end;
$$;

select 'OK' as status;
