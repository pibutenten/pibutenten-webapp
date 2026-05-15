#!/usr/bin/env python3
"""QA P0-2 — 테스트 데이터 5건 식별 (삭제는 별도 단계)."""
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

# 1. 테스트 카드들 (제목에 '테스트' 포함)
print("=== Test cards ===")
rows = run("""
select id, shortcode, question, status, created_at,
       (select handle from profiles p where p.id = c.author_id) as author_handle
from cards c
where question ilike '%테스트%' or question ilike '%test%' or question = '테스트'
order by created_at desc;
""")
for r in rows:
    print(f"  #{r.get('id')} [{r.get('status')}] {r.get('shortcode')} @{r.get('author_handle')} — {r.get('question')[:60]}")

# 2. 의심 댓글
print("\n=== Suspicious comments ===")
rows = run("""
select c.id, c.card_id, c.body, c.created_at,
       (select handle from profiles p where p.id = c.author_id) as author_handle
from comments c
where c.body ilike '%QA 댓글 테스트%'
   or c.body = '안녕하세요!'
   or c.body ilike '%테스트%'
order by c.created_at desc
limit 20;
""")
for r in rows:
    print(f"  #{r.get('id')} card={r.get('card_id')} @{r.get('author_handle')} — {r.get('body')[:60]}")

# 3. 의심 검색어 (search_logs)
print("\n=== Suspicious search queries ===")
rows = run("""
select query, count(*) as n
from search_logs
where query ilike '%아무태그나가능한%' or query ilike '%테스트%'
group by query
order by n desc
limit 10;
""")
for r in rows:
    print(f"  '{r.get('query')}' × {r.get('n')}")
