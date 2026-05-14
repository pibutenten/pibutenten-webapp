#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""qas/qa_* 참조하는 모든 PostgreSQL 함수 추출"""
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
SELECT p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
       LENGTH(pg_catalog.pg_get_functiondef(p.oid)) AS def_len
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    pg_catalog.pg_get_functiondef(p.oid) ILIKE '%public.qas%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%public.qa_%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '% qas %'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%FROM qas%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%FROM qa_%'
  )
ORDER BY p.proname;
"""
req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
    method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8', errors='ignore'))
    raise
print(f"Found {len(rows)} functions referencing qas/qa_* views:")
for r in rows:
    print(f"  {r['function_name']}({r['args']}) — def_len={r['def_len']}")
