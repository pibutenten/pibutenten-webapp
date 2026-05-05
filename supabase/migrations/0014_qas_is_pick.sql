-- =============================================================
-- 0014. qas.is_pick 컬럼 + 원장당 5개 제한
--
-- - 기존 lib/picks.ts (Python script로 미리 결정한 31개) → DB로 마이그레이션
-- - 원장이 본인 글에서 Pick 토글 가능 (최대 5개)
-- =============================================================

alter table public.qas
  add column if not exists is_pick boolean not null default false;

create index if not exists qas_pick_idx on public.qas(is_pick) where is_pick = true;

-- doctor 당 5개 제한 트리거
create or replace function public.check_doctor_pick_limit()
returns trigger
language plpgsql
as $func$
declare
  v_count int;
begin
  if new.is_pick is true and (old.is_pick is null or old.is_pick is false) then
    select count(*) into v_count
      from public.qas
     where doctor_id = new.doctor_id
       and is_pick = true
       and id <> new.id;
    if v_count >= 5 then
      raise exception 'PICK_LIMIT_EXCEEDED: 한 원장당 Pick은 최대 5개까지 가능합니다. 다른 Pick을 먼저 해제해주세요.';
    end if;
  end if;
  return new;
end;
$func$;

drop trigger if exists qas_pick_limit_check on public.qas;
create trigger qas_pick_limit_check
  before insert or update of is_pick on public.qas
  for each row execute function public.check_doctor_pick_limit();


-- 기존 lib/picks.ts의 31개 ID를 is_pick=true 로 일괄 마이그레이션
update public.qas set is_pick = true where id in (944,1199,882,1061,1095,964,1025,864,1144,1187,1169,1097,308,920,912,1003,1018,1062,107,751,952,1170,1172,876,3,41,832,708,612,676,671);
