#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""auth.users + profiles 매칭 표시."""
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
EP = "https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query"


def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-show/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


# auth.users 전체
print("=" * 80)
print("[auth.users 전체]")
print("=" * 80)
au_sql = "select id, email from auth.users order by created_at;"
au = run(au_sql)
print(f"총 {len(au)} row")
print(f"{'auth.users.id':<40} {'email'}")
for u in au:
    print(f"{u['id']:<40} {u.get('email') or '(NULL)'}")

# profiles 전체 + email 조인
print()
print("=" * 80)
print("[profiles + 매칭되는 auth.users.email]")
print("=" * 80)
sql = """
select
  p.id as profile_id,
  p.handle,
  p.role::text as role,
  p.display_name,
  p.auth_user_id,
  u.email as auth_email,
  (case when p.auth_user_id is null then 'NULL'
        when p.auth_user_id = p.id then 'self'
        else 'other' end) as fk_status
from public.profiles p
left join auth.users u on u.id = p.auth_user_id
order by p.auth_user_id nulls last, p.handle;
"""
rows = run(sql)
print(f"총 {len(rows)} row\n")
print(f"{'profiles.id':<40} {'handle':<18} {'role':<8} {'display':<14} {'auth_user_id':<40} {'auth.email':<28} {'fk'}")
print("-" * 170)
for r in rows:
    pid = r['profile_id']
    handle = r['handle'] or ""
    role = r['role'] or ""
    dn = (r['display_name'] or "")[:13]
    auth_id = r.get('auth_user_id') or "NULL"
    email = r.get('auth_email') or ""
    fk = r['fk_status']
    print(f"{pid:<40} {handle:<18} {role:<8} {dn:<14} {auth_id:<40} {email:<28} {fk}")
