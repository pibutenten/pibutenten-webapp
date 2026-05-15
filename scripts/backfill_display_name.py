#!/usr/bin/env python3
"""profiles.display_name 이 NULL 인 회원들에 대해 auth.users.user_metadata 의
{name, full_name, nickname} 중 첫 값으로 자동 채우기.

이미 display_name 있는 회원은 절대 건드리지 않음.

매핑 우선순위:
  user_metadata.name → user_metadata.full_name → user_metadata.nickname
모두 없으면 패스 (수동 보정 대상).
"""
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

# 1) 대상 조회 — display_name IS NULL 인 profile + 매칭되는 auth.users.user_metadata
print("=== 대상 조회 (display_name NULL) ===")
rows = run("""
select p.id, p.handle, p.role, p.created_at,
       au.raw_user_meta_data->>'name'      as meta_name,
       au.raw_user_meta_data->>'full_name' as meta_full_name,
       au.raw_user_meta_data->>'nickname'  as meta_nickname
from public.profiles p
left join auth.users au on au.id = p.id
where p.display_name is null
order by p.created_at desc;
""")
print(f"  대상 {len(rows)}명")
for r in rows[:20]:
    name = r.get('meta_name') or r.get('meta_full_name') or r.get('meta_nickname') or '(메타 없음)'
    print(f"  @{r.get('handle') or '-':20s} role={r.get('role')} candidate={name}")

# 2) 실제 UPDATE — coalesce 로 첫 non-empty 값 채움
print("\n=== UPDATE 실행 ===")
sql = """
update public.profiles p
set display_name = trim(coalesce(
  nullif(au.raw_user_meta_data->>'name', ''),
  nullif(au.raw_user_meta_data->>'full_name', ''),
  nullif(au.raw_user_meta_data->>'nickname', '')
))
from auth.users au
where au.id = p.id
  and p.display_name is null
  and (
    nullif(au.raw_user_meta_data->>'name', '') is not null
    or nullif(au.raw_user_meta_data->>'full_name', '') is not null
    or nullif(au.raw_user_meta_data->>'nickname', '') is not null
  )
returning p.id, p.handle, p.display_name;
"""
result = run(sql)
print(f"  UPDATE 완료: {len(result)}건")
for r in result:
    print(f"  ✅ @{r.get('handle') or '-':20s} display_name <- '{r.get('display_name')}'")

# 3) 여전히 NULL 인 회원 (메타에 이름 없음 — 수동 보정 필요)
print("\n=== 여전히 NULL display_name (수동 보정 대상) ===")
rows = run("""
select p.id, p.handle, p.role,
       au.email,
       au.raw_user_meta_data
from public.profiles p
left join auth.users au on au.id = p.id
where p.display_name is null
order by p.created_at desc;
""")
print(f"  {len(rows)}명")
for r in rows:
    print(f"  @{r.get('handle') or '-':20s} role={r.get('role')} email={r.get('email')}")
