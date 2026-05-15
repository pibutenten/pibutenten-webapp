#!/usr/bin/env python3
"""사과(profile) ↔ 김종식 원장님(doctor) doctor_accounts 매핑."""
import json, urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in Path('.env.local').read_text(encoding='utf-8').splitlines()
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

# 1. 사과 profile + 김종식 doctor 조회 + 기존 매핑 상태
print("=== 사과 profile (display_name) ===")
rows = run("""
select id, handle, display_name, role, auth_user_id
from profiles
where display_name = '사과';
""")
sagwa_id = None
for r in rows:
    print(f"  id={r['id']} handle={r['handle']} role={r['role']}")
    sagwa_id = r['id']

print("\n=== 김종식 원장님 (kim-jongsic) ===")
rows = run("""
select id, slug, name from doctors where slug = 'kim-jongsic';
""")
doctor_id = None
for r in rows:
    print(f"  id={r['id']} slug={r['slug']} name={r['name']}")
    doctor_id = r['id']

if not sagwa_id:
    print("\n❌ 사과 profile not found")
    sys.exit(1)
if not doctor_id:
    print("\n❌ 김종식 doctor not found")
    sys.exit(1)

print(f"\n=== 기존 doctor_accounts 매핑 (kim-jongsic) ===")
rows = run(f"""
select da.profile_id, p.handle, p.display_name
from doctor_accounts da
join profiles p on p.id = da.profile_id
where da.doctor_id = '{doctor_id}';
""")
for r in rows:
    print(f"  profile_id={r['profile_id'][:8]}... handle={r['handle']} name={r['display_name']}")
if not rows:
    print("  (없음)")

# 2. 사과 profile 의 role 을 doctor 로 + doctor_accounts 매핑 INSERT
print(f"\n=== 매핑 실행 ===")
sql = f"""
do $$
begin
  -- 사과 profile role 을 doctor 로 (이미 doctor 면 noop)
  update public.profiles set role = 'doctor'::user_role where id = '{sagwa_id}';

  -- doctor_accounts 매핑 추가 (중복 시 무시)
  insert into public.doctor_accounts (doctor_id, profile_id)
  values ('{doctor_id}', '{sagwa_id}')
  on conflict do nothing;
end $$;
select 'OK' as status;
"""
result = run(sql)
print(f"  result: {result}")

# 3. 검증
print(f"\n=== 검증 ===")
rows = run(f"""
select da.profile_id, p.handle, p.display_name, p.role
from doctor_accounts da
join profiles p on p.id = da.profile_id
where da.doctor_id = '{doctor_id}';
""")
for r in rows:
    print(f"  -> handle={r['handle']} name={r['display_name']} role={r['role']}")
