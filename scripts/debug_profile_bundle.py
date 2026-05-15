#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
PROJECT_REF = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_PROJECT_REF=')), None)
EP = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'

sql = """
SELECT
  p.id, p.auth_user_id, p.role, p.handle, p.display_name,
  (p.id = p.auth_user_id) AS is_primary,
  da.doctor_id, d.slug AS doctor_slug
FROM public.profiles p
LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
LEFT JOIN public.doctors d ON d.id = da.doctor_id
WHERE p.auth_user_id IN (
  SELECT auth_user_id FROM public.profiles WHERE display_name IN ('배스킨','배정민','개발자','반짝이')
)
ORDER BY p.auth_user_id, is_primary DESC, p.role;
"""
body = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(EP, data=body, method='POST', headers={
  'Authorization': f'Bearer {TOKEN}',
  'Content-Type': 'application/json',
  'User-Agent': 'pibutenten-debug/1.0',
})
with urllib.request.urlopen(req, timeout=30) as resp:
  rows = json.loads(resp.read().decode('utf-8'))
for r in rows:
  print(json.dumps(r, ensure_ascii=False))
