#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""profiles 테이블 실제 값 보여주기."""
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


sql = """
select
  id,
  handle,
  display_name,
  role::text as role,
  auth_user_id
from public.profiles
order by auth_user_id nulls last, handle;
"""
rows = run(sql)

# 묶음 라벨 부여
groups = {}
group_n = 0
for r in rows:
    auth = r.get('auth_user_id')
    if auth and auth not in groups:
        group_n += 1
        groups[auth] = f"G{group_n}"

print(f"총 profiles row: {len(rows)}\n")
print(f"{'profiles.id':<40} {'handle':<22} {'role':<10} {'display':<14} {'auth_user_id':<40} {'묶음'}")
print("-" * 140)
for r in rows:
    pid = r['id']
    handle = r['handle'] or ""
    role = r['role'] or ""
    dn = (r['display_name'] or "")[:12]
    auth = r.get('auth_user_id') or ""
    grp = groups.get(auth, "—") if auth else "—"
    print(f"{pid:<40} {handle:<22} {role:<10} {dn:<14} {auth:<40} {grp}")
