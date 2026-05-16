#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply migrations 0109/0110/0111 in order."""
import json, sys, urllib.request, urllib.error
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

for mig in [
    "0109_soft_delete_anonymization.sql",
    "0110_drop_legal_name.sql",
    "0111_contact_email_dedup.sql",
]:
    print(f"\n=== applying {mig} ===")
    sql = (ROOT / "supabase" / "migrations" / mig).read_text(encoding="utf-8")
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-migration/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"OK ({resp.status}): {resp.read().decode('utf-8')[:800]}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1500]}")
        sys.exit(1)

print("\nAll 3 migrations applied successfully.")
