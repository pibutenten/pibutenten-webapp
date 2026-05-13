#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 9 진행 중 DB 상태 확인."""
import json, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
EP = "https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query"


def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-check/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


print("[1] profiles 총 개수")
print(run("select count(*) from public.profiles;"))

print("\n[2] profile_identities 총 개수")
print(run("select count(*) from public.profile_identities;"))

print("\n[3] profiles.auth_user_id 백필 상태")
print(run("select count(*) filter (where auth_user_id is not null) as with_auth, count(*) filter (where auth_user_id is null) as without_auth from public.profiles;"))

print("\n[4] profiles_id_fkey 존재 여부")
print(run("""
select count(*) as fkey_count
from information_schema.table_constraints
where table_schema='public' and table_name='profiles' and constraint_name='profiles_id_fkey';
"""))

print("\n[5] profiles에 INSERT된 신규 row (profile_identities.id와 매칭)")
print(run("""
select count(*) as migrated
from public.profiles p
where exists (select 1 from public.profile_identities pi where pi.id = p.id);
"""))

print("\n[6] auth.users.id에 없는 profiles row")
print(run("""
select count(*) as orphan_profiles
from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);
"""))
