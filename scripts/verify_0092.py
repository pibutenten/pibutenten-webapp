#!/usr/bin/env python3
"""인기태그 RPC 검증: get_top_tags(0, 1, 10) 호출."""
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
-- 7일 / 30일 / 전체 각각 top 10 확인
select '7d' as period, * from get_top_tags(7, 1, 10);
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.loads(resp.read())
    print(f"Top tags (7d): {len(data)} rows")
    for r in data[:10]:
        print(f"  {r.get('keyword')}: {r.get('cnt')}")

# 전체 기간
sql2 = "select * from get_top_tags(0, 1, 10);"
body2 = json.dumps({"query": sql2}).encode("utf-8")
req2 = urllib.request.Request(EP, data=body2, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
with urllib.request.urlopen(req2, timeout=60) as resp:
    data = json.loads(resp.read())
    print(f"\nTop tags (전체): {len(data)} rows")
    for r in data[:10]:
        print(f"  {r.get('keyword')}: {r.get('cnt')}")
