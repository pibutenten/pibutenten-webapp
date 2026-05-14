#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
EP = "https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query"
sql = """
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conrelid IN (
  'public.cards'::regclass, 'public.card_likes'::regclass, 'public.card_saves'::regclass,
  'public.card_views'::regclass, 'public.card_shares'::regclass, 'public.card_impressions'::regclass,
  'public.card_ratings'::regclass, 'public.comments'::regclass, 'public.notifications'::regclass
)
ORDER BY conrelid::regclass::text, conname;
"""
req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
    method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
with urllib.request.urlopen(req, timeout=30) as resp:
    rows = json.loads(resp.read().decode('utf-8'))
prev = ''
for r in rows:
    if r['table_name'] != prev:
        print(f"\n== {r['table_name']} ==")
        prev = r['table_name']
    print(f"  {r['conname']}")
