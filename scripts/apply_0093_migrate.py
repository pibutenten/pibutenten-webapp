#!/usr/bin/env python3
"""0093 — _suggest_handle alt_handle 참조 제거 (새 가입자 차단 fix)."""
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
sql = (ROOT / "supabase" / "migrations" / "0093_fix_suggest_handle_drop_alt_handle.sql").read_text(encoding="utf-8")
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        print(f"OK ({resp.status}): {resp.read().decode('utf-8')[:500]}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1000]}")
    raise

# 검증 — _suggest_handle 호출
print("\n=== 검증 ===")
sql2 = "select public._suggest_handle('newuser@gmail.com') as h;"
body2 = json.dumps({"query": sql2}).encode("utf-8")
req2 = urllib.request.Request(EP, data=body2, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "pibutenten-migration/1.0",
})
with urllib.request.urlopen(req2, timeout=30) as resp:
    print(f"  _suggest_handle('newuser@gmail.com') = {resp.read().decode('utf-8')}")
