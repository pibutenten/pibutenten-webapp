#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
0039_tag_qas_scored.sql 을 Supabase Management API로 적용.
"""
import json
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
ENDPOINT = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

ROOT = Path(__file__).parent.parent
env_path = ROOT / ".env.local"
ACCESS_TOKEN = None
for line in env_path.read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()
        break

if not ACCESS_TOKEN:
    raise SystemExit("SUPABASE_ACCESS_TOKEN missing in .env.local")

sql = (ROOT / "supabase" / "migrations" / "0039_tag_qas_scored.sql").read_text(encoding="utf-8")

body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(
    ENDPOINT,
    data=body,
    method="POST",
    headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "pibutenten-migration/1.0",
    },
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = resp.read().decode("utf-8")
        print(f"OK ({resp.status}): {payload[:500]}")
except urllib.error.HTTPError as e:
    err = e.read().decode("utf-8", errors="ignore")
    print(f"HTTP ERROR {e.code}: {err[:1500]}")
    raise
