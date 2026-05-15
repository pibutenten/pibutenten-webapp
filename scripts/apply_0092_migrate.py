#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0092 — get_top_tags / get_indexable_tags RPC: qas → cards 마이그레이션."""
import json, urllib.request, urllib.error
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
sql = (ROOT / "supabase" / "migrations" / "0092_fix_get_top_tags_use_cards.sql").read_text(encoding="utf-8")
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        print(f"OK ({resp.status}): {resp.read().decode('utf-8')[:3000]}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:3000]}")
    raise
