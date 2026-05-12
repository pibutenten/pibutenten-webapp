#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배정민 profile_identities에서 'bae-jungmin' 중복 row 삭제.
(primary identity는 profiles.handle 자체가 담당하므로 profile_identities에 동일 handle 두면 안 됨)
"""
import json, urllib.request, urllib.error, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = next(
    (l.split("=", 1)[1].strip() for l in (Path(__file__).parent.parent / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)


def q(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1500]}"


# 모든 profile에 대해 — primary handle (profiles.handle) 과 동일한 profile_identities row 삭제
sql = """
delete from public.profile_identities pi
using public.profiles p
where pi.profile_id = p.id
  and pi.handle = p.handle;
"""
print("--- delete duplicate primary handles ---")
print(q(sql))

print("\n--- jminbae identities after ---")
print(q("select handle, display_name, kind, doctor_id from public.profile_identities where profile_id='929fc408-ec3b-48d0-b404-d500a606dcaa' order by created_at"))
