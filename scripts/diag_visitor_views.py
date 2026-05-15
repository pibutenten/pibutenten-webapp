#!/usr/bin/env python3
"""방문자/조회수 집계 진단:
- card_views, card_impressions, card_shares 최근 row 수 + 최신 timestamp
- get_top_visitors RPC 본문 + 호출 결과
- RLS 정책 점검
"""
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

print("=== 활동 테이블 row 수 + 최신 timestamp ===")
for tbl in ['card_views', 'card_impressions', 'card_shares', 'card_likes', 'card_saves', 'comments']:
    try:
        rows = run(f"select count(*) as n, max(created_at) as last from {tbl};")
        r = rows[0]
        print(f"  {tbl:20s} count={r['n']:>6}  last={r.get('last') or '(없음)'}")
    except Exception as e:
        print(f"  {tbl:20s} ERROR: {e}")

print("\n=== card_views 최근 5건 (어느 카드, 누가) ===")
try:
    rows = run("""
    select v.id, v.card_id, v.user_id, v.created_at,
      (select handle from profiles where id=v.user_id) as handle,
      (select question from cards where id=v.card_id) as q
    from card_views v
    order by v.created_at desc
    limit 5;
    """)
    for r in rows:
        print(f"  view#{r['id']} card#{r['card_id']} @{r.get('handle')} at={r['created_at'][:19]}")
        print(f"    Q: {(r.get('q') or '')[:70]}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n=== get_top_visitors RPC 본문 ===")
rows = run("""
select pg_get_functiondef(oid) as body from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_top_visitors';
""")
if rows:
    print(rows[0]['body'][:2500])
else:
    print("  ❌ get_top_visitors 함수 없음")

print("\n=== get_top_visitors 호출 테스트 (7일) ===")
try:
    rows = run("select * from get_top_visitors(7, 0, 10);")
    print(f"  결과 {len(rows)} rows:")
    for r in rows[:5]:
        print(f"    {r}")
except Exception as e:
    print(f"  ❌ ERROR: {e}")

print("\n=== card_views RLS 정책 ===")
rows = run("""
select polname, polcmd, pg_get_expr(polqual, polrelid) as qual,
       pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy where polrelid = 'public.card_views'::regclass;
""")
for r in rows:
    print(f"  policy={r['polname']} cmd={r['polcmd']}")
    print(f"    qual: {r.get('qual')}")
    print(f"    with_check: {r.get('with_check')}")
