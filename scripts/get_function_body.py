#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Get specific function body"""
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

fns = sys.argv[1:] if len(sys.argv) > 1 else [
    "toggle_qa_like", "toggle_qa_save", "toggle_qa_pick", "increment_qa_share",
]
for fn in fns:
    sql = f"""
SELECT pg_catalog.pg_get_functiondef(p.oid) AS def
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '{fn}'
LIMIT 5;
"""
    req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
    print(f"\n========== {fn} ==========")
    for r in rows:
        print(r['def'])
        print("---")
