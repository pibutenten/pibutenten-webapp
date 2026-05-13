#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
video_id가 NULL인 28개 카드의 timestamp·meta 상태 확인.
"""
import json, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
EP = "https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query"

sql = """
select
  q.id,
  q.question,
  d.name as doctor_name,
  q.external_url,
  q.meta,
  q.created_at::date as created
from public.qas q
left join public.doctors d on d.id = q.doctor_id
where q.video_id is null
order by q.created_at desc;
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
    "User-Agent": "pibutenten-check/1.0",
})
with urllib.request.urlopen(req, timeout=60) as resp:
    rows = json.loads(resp.read().decode("utf-8"))

print(f"총 {len(rows)}건\n")
for r in rows:
    meta = r.get("meta") or {}
    if isinstance(meta, str):
        try: meta = json.loads(meta)
        except: meta = {}
    ts = meta.get("timestamp") if isinstance(meta, dict) else None
    print(f"id={r['id']} [{r['doctor_name']}] {r['created']}")
    print(f"  question: {r['question'][:60]}")
    print(f"  external_url: {r['external_url']}")
    print(f"  meta.video_id: {meta.get('video_id') if isinstance(meta, dict) else None}")
    print(f"  meta.timestamp: {ts}")
    print()
