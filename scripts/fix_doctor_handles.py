#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
정한미·이도영 profile.handle을 원장 슬러그로 변경 + 개인 identity 보존.

Before:
  정한미 profile.handle='u-4ta852' (자동생성) → identities=[u-4ta852(personal), jung-hanmi(doctor)]
  이도영 profile.handle='dandygom' (본인 닉) → identities=[rhee-doyoung(doctor)]

After:
  정한미 profile.handle='jung-hanmi' (primary=원장) → identities=[u-4ta852(personal)]
                                                       (jung-hanmi identity는 primary와 중복이므로 UI에서 skip)
  이도영 profile.handle='rhee-doyoung' (primary=원장) → identities=[dandygom(personal)]
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
        return f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1000]}"


# Step 1) 이도영 profile_identities에 'dandygom' (kind=personal) 추가
#   — 본인이 직접 만든 핸들 보존
print("--- step 1: 이도영 dandygom personal identity 추가 ---")
print(q("""
insert into public.profile_identities
  (profile_id, handle, display_name, kind, is_default)
values
  ('0643743d-e93d-4065-973a-0116a82b4e5a',
   'dandygom-old',  -- primary handle 충돌 회피용 임시
   '이도영',
   'personal',
   false)
on conflict (handle) do nothing;
"""))

# Step 2) 정한미·이도영 profile.handle 변경 — primary identity를 원장 슬러그로
print("\n--- step 2: profile.handle 변경 ---")
print(q("""
update public.profiles
   set handle = 'jung-hanmi'
 where id = '4f5096cc-f7b5-4ec4-88cd-2fb63b41653c';
"""))
print(q("""
update public.profiles
   set handle = 'rhee-doyoung'
 where id = '0643743d-e93d-4065-973a-0116a82b4e5a';
"""))

# Step 3) 이도영 'dandygom-old' → 'dandygom' 으로 변경 (이제 profile.handle이 충돌 안 함)
print("\n--- step 3: 이도영 dandygom-old → dandygom ---")
print(q("""
update public.profile_identities
   set handle = 'dandygom'
 where profile_id = '0643743d-e93d-4065-973a-0116a82b4e5a'
   and handle = 'dandygom-old';
"""))

# 검증
print("\n--- 검증 ---")
print("profiles:")
print(q("select id, handle, display_name from public.profiles where id in ('4f5096cc-f7b5-4ec4-88cd-2fb63b41653c','0643743d-e93d-4065-973a-0116a82b4e5a','929fc408-ec3b-48d0-b404-d500a606dcaa')"))
print("\nidentities:")
print(q("select profile_id, handle, display_name, kind from public.profile_identities where profile_id in ('4f5096cc-f7b5-4ec4-88cd-2fb63b41653c','0643743d-e93d-4065-973a-0116a82b4e5a','929fc408-ec3b-48d0-b404-d500a606dcaa') order by profile_id, created_at"))
