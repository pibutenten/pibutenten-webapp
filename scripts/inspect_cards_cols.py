#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""cards 테이블 컬럼 조회."""
import json, urllib.request, urllib.error
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
sql = """
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'cards'
order by ordinal_position;
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    print(resp.read().decode('utf-8'))
