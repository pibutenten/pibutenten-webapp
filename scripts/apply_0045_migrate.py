#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0045 — profile_identities → profiles 이관 + FK 재배선."""
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
sql = (ROOT / "supabase" / "migrations" / "0045_migrate_identities_to_profiles.sql").read_text(encoding="utf-8")
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
