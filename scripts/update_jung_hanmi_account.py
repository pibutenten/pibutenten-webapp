#!/usr/bin/env python3
"""정한미 원장님 doctor_accounts 매핑 변경: @u-4ta852 → @u-x3x6fb (너구리)."""
import json, urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)

def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "pibutenten-migration/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

# 1. 확인 — 정한미 원장님의 doctor_id, 두 profile id 조회
print("=== Verify before ===")
rows = run("""
select 'doctor' as kind, id, slug, name from doctors where slug = 'jung-hanmi'
union all
select 'profile' as kind, id, handle, display_name from profiles where handle in ('u-4ta852', 'u-x3x6fb')
union all
select 'mapping' as kind, da.profile_id as id, p.handle as slug,
  (select name from doctors d where d.id = da.doctor_id) as name
from doctor_accounts da
join profiles p on p.id = da.profile_id
where da.doctor_id = (select id from doctors where slug = 'jung-hanmi');
""")
for r in rows:
    print(f"  [{r['kind']}] id={r['id'][:8] if r['id'] else 'NULL'}... slug/handle={r.get('slug')} name={r.get('name')}")

# 2. 실행 — 기존 매핑 삭제 + 새 매핑 추가
print("\n=== Update ===")
result = run("""
do $$
declare
  v_doctor_id uuid;
  v_old_profile uuid;
  v_new_profile uuid;
begin
  select id into v_doctor_id from doctors where slug = 'jung-hanmi';
  select id into v_old_profile from profiles where handle = 'u-4ta852';
  select id into v_new_profile from profiles where handle = 'u-x3x6fb';

  raise notice 'doctor_id=%, old=%, new=%', v_doctor_id, v_old_profile, v_new_profile;

  if v_doctor_id is null then
    raise exception 'doctor jung-hanmi not found';
  end if;
  if v_new_profile is null then
    raise exception 'profile u-x3x6fb not found';
  end if;

  -- 기존 매핑 삭제 (있다면)
  if v_old_profile is not null then
    delete from doctor_accounts
    where doctor_id = v_doctor_id and profile_id = v_old_profile;
  end if;

  -- 새 매핑 추가 (중복 시 무시)
  insert into doctor_accounts (doctor_id, profile_id)
  values (v_doctor_id, v_new_profile)
  on conflict do nothing;
end $$;
select 'OK' as status;
""")
print(f"  result: {result}")

# 3. 검증 — 매핑 결과 확인
print("\n=== Verify after ===")
rows = run("""
select da.profile_id, p.handle, p.display_name, p.role
from doctor_accounts da
join profiles p on p.id = da.profile_id
where da.doctor_id = (select id from doctors where slug = 'jung-hanmi');
""")
for r in rows:
    print(f"  -> profile: {r.get('handle')} ({r.get('display_name')}) role={r.get('role')}")
