#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
sql = """
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_top_search_queries', 'get_indexable_tags');
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
    "User-Agent": "pibutenten-check/1.0",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    res = json.loads(resp.read().decode("utf-8"))
for r in res:
    print(f"=== {r['proname']}({r['args']}) ===")
    print(r['definition'])
    print()
