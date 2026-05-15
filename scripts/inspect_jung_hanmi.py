#!/usr/bin/env python3
"""정한미 원장님 + 너구리 + u-4ta852 의 정확한 상태 조회."""
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

print("=== 정한미 원장님 (jung-hanmi) ===")
rows = run("""
select p.id, p.handle, p.display_name, p.role, p.auth_user_id
from profiles p where p.handle = 'jung-hanmi';
""")
for r in rows:
    print(f"  id={r['id']}\n    handle={r['handle']} name={r['display_name']} role={r['role']} auth_user_id={r['auth_user_id']}")

print("\n=== 너구리 (u-x3x6fb) ===")
rows = run("""
select p.id, p.handle, p.display_name, p.role, p.auth_user_id
from profiles p where p.handle = 'u-x3x6fb';
""")
for r in rows:
    print(f"  id={r['id']}\n    handle={r['handle']} name={r['display_name']} role={r['role']} auth_user_id={r['auth_user_id']}")

print("\n=== 잘못 만들어진 sub-profile (u-4ta852) ===")
rows = run("""
select p.id, p.handle, p.display_name, p.role, p.auth_user_id
from profiles p where p.handle = 'u-4ta852';
""")
for r in rows:
    print(f"  id={r['id']}\n    handle={r['handle']} name={r['display_name']} role={r['role']} auth_user_id={r['auth_user_id']}")

# u-4ta852 활동 데이터 카운트 (cards/comments/likes)
print("\n=== u-4ta852 활동 데이터 ===")
rows = run("""
select 'cards' as kind, count(*) as n from cards where author_id = (select id from profiles where handle='u-4ta852')
union all
select 'comments', count(*) from comments where author_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_likes', count(*) from card_likes where user_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_saves', count(*) from card_saves where user_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_views', count(*) from card_views where user_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_shares', count(*) from card_shares where user_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_impressions', count(*) from card_impressions where user_id = (select id from profiles where handle='u-4ta852')
union all
select 'card_ratings', count(*) from card_ratings where user_id = (select id from profiles where handle='u-4ta852');
""")
for r in rows:
    print(f"  {r['kind']}: {r['n']}")

# u-x3x6fb 활동 데이터 (살릴 데이터)
print("\n=== u-x3x6fb (너구리) 활동 데이터 ===")
rows = run("""
select 'cards' as kind, count(*) as n from cards where author_id = (select id from profiles where handle='u-x3x6fb')
union all
select 'comments', count(*) from comments where author_id = (select id from profiles where handle='u-x3x6fb')
union all
select 'card_likes', count(*) from card_likes where user_id = (select id from profiles where handle='u-x3x6fb')
union all
select 'card_saves', count(*) from card_saves where user_id = (select id from profiles where handle='u-x3x6fb');
""")
for r in rows:
    print(f"  {r['kind']}: {r['n']}")
