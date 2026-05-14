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
sql = "SELECT id, type, category, question FROM public.qas WHERE type = 'article' OR category = 'article' LIMIT 50;"
req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
    method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
with urllib.request.urlopen(req, timeout=30) as resp:
    print(json.dumps(json.loads(resp.read().decode('utf-8')), ensure_ascii=False, indent=2))
