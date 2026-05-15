#!/usr/bin/env python3
"""RLS 점검 — 주요 테이블 RLS 활성화 + 정책 수 확인."""
import json, urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding="utf-8")

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
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

# 주요 테이블의 RLS 활성화 + 정책 수
print("=== RLS status ===")
rows = run("""
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','cards','comments','card_likes','card_saves','card_ratings',
    'card_shares','card_views','card_impressions','doctors','doctor_accounts',
    'doctor_profiles','search_logs','notifications','reserved_handles',
    'push_subscriptions'
  )
order by c.relname;
""")
print(f"{'table':<25} {'RLS':<6} {'policies'}")
for r in rows:
    status = "ON" if r['rls_enabled'] else "❌OFF"
    print(f"  {r['table_name']:<23} {status:<6} {r['policy_count']}")
