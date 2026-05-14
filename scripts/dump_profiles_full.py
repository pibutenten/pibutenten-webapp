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
sql = """
SELECT
  u.email,
  p.display_name,
  p.handle,
  p.role,
  p.id          AS profile_id,
  p.auth_user_id,
  p.alt_handle,
  p.alt_display_name,
  p.bio,
  p.birth_date,
  p.gender,
  p.level,
  p.activity_score,
  p.is_public,
  p.terms_agreed_at,
  p.marketing_email_consent,
  d.id          AS doctor_id,
  d.slug        AS doctor_slug,
  d.name        AS doctor_name,
  d.branch      AS doctor_branch
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_user_id
LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
LEFT JOIN public.doctors d ON d.id = da.doctor_id
ORDER BY p.auth_user_id NULLS FIRST, p.created_at;
"""
body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(EP, data=body, method="POST", headers={
    "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
    "User-Agent": "pibutenten-dump/1.0",
})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(json.dumps(data, ensure_ascii=False, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:2000]}")
    raise
