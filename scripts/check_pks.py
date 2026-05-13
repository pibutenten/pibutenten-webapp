#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""qa_likes·qa_saves·comment_likes PK·unique constraint 확인."""
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
        "User-Agent": "pibutenten-audit/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


sql = """
select
  cl.relname as src_table,
  cn.conname as constraint_name,
  cn.contype as type,
  pg_get_constraintdef(cn.oid) as definition
from pg_constraint cn
join pg_class cl on cl.oid = cn.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'public'
  and cl.relname in ('qa_likes', 'qa_saves', 'comment_likes', 'qa_ratings')
  and cn.contype in ('p', 'u')
order by cl.relname, cn.contype;
"""
print(json.dumps(run(sql), indent=2, ensure_ascii=False))
