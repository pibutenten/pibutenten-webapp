#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DB 상태 점검: qas/qa_* 테이블, 컬럼, 인덱스 목록"""
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
    "tables": "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename='qas' OR tablename LIKE 'qa_%') ORDER BY tablename;",
    "columns": """
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND (column_name = 'qa_id' OR column_name = 'card_id')
ORDER BY table_name, column_name;
""",
    "indexes": "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'qa_%' ORDER BY indexname;",
}

for name, sql in queries.items():
    print(f"\n== {name} ==")
    req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(json.dumps(json.loads(resp.read().decode('utf-8')), ensure_ascii=False, indent=2))
