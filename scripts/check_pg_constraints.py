#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pg_constraint 직접 조회 — auth.users·profile_identities 가리키는 모든 FK."""
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


# pg_constraint 직접 — 모든 FK 중 auth.users·profile_identities 가리키는 것
sql = """
select
  cl.relname as src_table,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and pg_get_constraintdef(c.oid) ~ '(auth\\.users|profile_identities|profiles\\(id\\))'
order by cl.relname, c.conname;
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
print("[FK constraints]")
print(json.dumps(run(sql), indent=2, ensure_ascii=False))
