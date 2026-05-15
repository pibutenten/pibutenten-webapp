#!/usr/bin/env python3
"""handle_new_user 트리거 + profiles NOT NULL 컬럼 + 최근 auth.users INSERT 실패 로그."""
import json, urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in Path('.env.local').read_text(encoding='utf-8').splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)

def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "pibutenten-migration/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

# 1) auth.users INSERT 시 발사되는 트리거 목록
print("=== auth.users INSERT triggers ===")
rows = run("""
select tgname, tgfoid::regproc as fn, pg_get_triggerdef(oid) as ddl
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;
""")
for r in rows:
    print(f"  trigger: {r['tgname']}\n    fn: {r['fn']}\n    ddl (first 200): {r['ddl'][:200]}\n")

# 2) handle_new_user 함수 본문
print("\n=== handle_new_user function body ===")
rows = run("""
select p.proname, pg_get_functiondef(p.oid) as body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';
""")
if not rows:
    print("  (없음 — 다른 schema 일 수 있음)")
for r in rows:
    print(r['body'][:3500])

# 3) profiles 테이블의 NOT NULL 컬럼 (default 없는 것)
print("\n=== profiles NOT NULL columns (no default) ===")
rows = run("""
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and is_nullable = 'NO'
order by ordinal_position;
""")
for r in rows:
    print(f"  {r['column_name']} ({r['data_type']}) default={r['column_default']}")
