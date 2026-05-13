#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""auth.users·profiles 가리키는 모든 FK 전수조사."""
import json, urllib.request
from pathlib import Path

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
        "User-Agent": "pibutenten-audit/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


# 1) auth.users 가리키는 FK
sql_auth = """
select tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_schema = 'auth'
  and ccu.table_name = 'users'
order by tc.table_schema, tc.table_name, kcu.column_name;
"""
print("[1] auth.users 가리키는 FK")
print(json.dumps(run(sql_auth), indent=2, ensure_ascii=False))

# 2) profiles 가리키는 FK
sql_prof = """
select tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_schema = 'public'
  and ccu.table_name = 'profiles'
order by tc.table_schema, tc.table_name, kcu.column_name;
"""
print("\n[2] public.profiles 가리키는 FK")
print(json.dumps(run(sql_prof), indent=2, ensure_ascii=False))
