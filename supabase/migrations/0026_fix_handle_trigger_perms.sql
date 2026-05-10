-- 0022의 check_handle_not_reserved trigger 권한 fix.
-- reserved_handles 테이블에 anon/authenticated SELECT 권한이 없어서
-- 사용자가 handle update 시도 → trigger가 SELECT FROM reserved_handles 실행 →
-- permission denied → 에러 메시지에 "reserved" 단어가 포함되어 frontend가
-- "예약된 id"로 잘못 분류. SECURITY DEFINER로 RLS·권한 우회.

create or replace function public.check_handle_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.handle
  ) then
    raise exception '예약된 핸들입니다: %', new.handle;
  end if;
  if new.alt_handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.alt_handle
  ) then
    raise exception '예약된 핸들입니다: %', new.alt_handle;
  end if;
  if new.handle is not null and new.alt_handle is not null
     and new.handle = new.alt_handle then
    raise exception 'handle과 alt_handle은 다른 값이어야 합니다';
  end if;
  return new;
end;
$$;
