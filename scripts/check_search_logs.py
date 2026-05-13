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

queries = {
    "총 row 수": "select count(*) as total from public.search_logs;",
    "최근 7일": "select count(*) as recent7 from public.search_logs where created_at > now() - interval '7 days';",
    "전체 기간 top 10": "select query, count(*) as cnt from public.search_logs where length(trim(query)) > 0 group by query order by cnt desc limit 10;",
    "최근 5개 row": "select id, query, created_at, user_id from public.search_logs order by created_at desc limit 5;",
    "RLS 정책": "select polname, polcmd from pg_policy where polrelid = 'public.search_logs'::regclass;",
    "GRANT": "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='search_logs';",
}
for label, sql in queries.items():
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-check/1.0",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))
    print(f"=== {label} ===")
    print(json.dumps(res, indent=2, ensure_ascii=False)[:2000])
    print()
