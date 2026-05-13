#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
sql = (ROOT / "supabase" / "migrations" / "0058_admin_kpi_rpc.sql").read_text(encoding="utf-8")
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print(f"OK ({resp.status}): {resp.read().decode('utf-8')[:1500]}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1500]}")
    raise
