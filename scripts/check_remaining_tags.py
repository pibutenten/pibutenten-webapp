#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

ROOT = Path(__file__).parent.parent
TOKEN = None
for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        TOKEN = line.split("=", 1)[1].strip()


def run_sql(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        EP,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "pibutenten/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:500]}"


candidates = [
    "리프팅시작시기",
    "30대리프팅",
    "콜라겐노화",
    "노화콜라겐",
    "섬유모세포자극",
    "스킨부스터병행",
    "리프팅효과개선",
    "피부예방",
    "예방시술",
]
for kw in candidates:
    safe = kw.replace("'", "''")
    rows = run_sql(
        f"select id from public.qas where '{safe}' = any(keywords) limit 3"
    )
    print(f"{kw}: {rows}")
