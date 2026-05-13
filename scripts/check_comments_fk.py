#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""comments_author_id_fkey 어디 가리키는지 확인."""
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


# comments, qa_likes, qa_saves, comment_likes 의 모든 FK
sql = """
select tc.table_name, kcu.column_name, tc.constraint_name,
       ccu.table_schema as ref_schema, ccu.table_name as ref_table, ccu.column_name as ref_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in ('comments','qa_likes','qa_saves','comment_likes','qa_ratings')
order by tc.table_name, kcu.column_name;
"""
print("[comments·qa_likes·qa_saves·qa_ratings·comment_likes FK 전체]")
print(json.dumps(run(sql), indent=2, ensure_ascii=False))

# comments.author_id 컬럼 정보
sql2 = """
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('comments','qa_likes','qa_saves','comment_likes','qa_ratings')
  and column_name in ('author_id','user_id','identity_id')
order by table_name, column_name;
"""
print("\n[관련 컬럼 정보]")
print(json.dumps(run(sql2), indent=2, ensure_ascii=False))
