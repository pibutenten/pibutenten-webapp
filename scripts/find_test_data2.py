#!/usr/bin/env python3
"""추가 검색 — pending_review 카드 + recent QA 활동."""
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

# pending_review or draft 상태 카드
print("=== pending_review/draft cards (recent) ===")
rows = run("""
select id, shortcode, status, question, created_at,
       (select handle from profiles p where p.id = c.author_id) as author_handle
from cards c
where status in ('pending_review','draft')
order by created_at desc
limit 20;
""")
for r in rows:
    print(f"  #{r.get('id')} [{r.get('status')}] @{r.get('author_handle')} — {(r.get('question') or '')[:60]}")

# 최근 댓글 (모든 상태)
print("\n=== Recent comments (last 20) ===")
rows = run("""
select c.id, c.card_id, c.body, c.status, c.created_at,
       (select handle from profiles p where p.id = c.author_id) as author_handle
from comments c
order by c.created_at desc
limit 20;
""")
for r in rows:
    print(f"  #{r.get('id')} card={r.get('card_id')} [{r.get('status')}] @{r.get('author_handle')} — {(r.get('body') or '')[:60]}")
