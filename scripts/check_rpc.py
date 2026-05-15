#!/usr/bin/env python3
"""기존 0072 RPCs 가 실제로 정의되어 있는지, posted_as 참조 여부 확인."""
import json, urllib.request
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
select p.proname, pg_get_functiondef(p.oid)::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_top_tags', 'feed_cards_scored', 'search_cards_scored', 'tag_cards_scored');
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read())
    for row in data:
        print(f"=== {row['proname']} ===")
        body = row.get('pg_get_functiondef', '')
        print(body[:1500])
        print()
