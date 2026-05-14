#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
회원 전체를 CSV로 저장 — Excel에서 바로 열림 (UTF-8 BOM).
출력: D:/Dropbox/Claude Code/260503 피부텐텐 웹앱개발/pibutenten-app/scripts/members.csv
"""
import json, sys, urllib.request, urllib.error, csv
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
  p.birth_date::text,
  p.gender,
  p.level,
  p.activity_score,
  p.is_public,
  p.terms_agreed_at::text,
  p.marketing_email_consent,
  d.id          AS doctor_id,
  d.slug        AS doctor_slug,
  d.name        AS doctor_name,
  d.branch      AS doctor_branch,
  p.created_at::text AS profile_created_at
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
with urllib.request.urlopen(req, timeout=60) as resp:
    rows = json.loads(resp.read().decode('utf-8'))

cols = [
    "email", "display_name", "handle", "role",
    "profile_id", "auth_user_id", "alt_handle", "alt_display_name",
    "bio", "birth_date", "gender", "level", "activity_score",
    "is_public", "terms_agreed_at", "marketing_email_consent",
    "doctor_id", "doctor_slug", "doctor_name", "doctor_branch",
    "profile_created_at",
]
out = ROOT / "scripts" / "members.csv"
with out.open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: ("" if r.get(k) is None else r[k]) for k in cols})
print(f"OK: {out} ({len(rows)} rows)")
