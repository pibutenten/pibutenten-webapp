#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
PROJECT_REF = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_PROJECT_REF=')), None)
EP = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'

# 배정민 묶음의 user_id 들
BUNDLE = ['929fc408-ec3b-48d0-b404-d500a606dcaa', '722c8b4a-9091-4b7d-ae7c-94dd6cbe7135', '134850cb-f0a2-4551-8f0d-2f9e61129746']

sql = f"""
SELECT
  l.created_at,
  l.card_id,
  l.user_id,
  p.display_name,
  p.role,
  p.handle,
  c.question
FROM public.card_likes l
LEFT JOIN public.profiles p ON p.id = l.user_id
LEFT JOIN public.cards c ON c.id = l.card_id
WHERE l.user_id IN ('{BUNDLE[0]}', '{BUNDLE[1]}', '{BUNDLE[2]}')
ORDER BY l.created_at DESC
LIMIT 30;
"""
body = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(EP, data=body, method='POST', headers={
  'Authorization': f'Bearer {TOKEN}',
  'Content-Type': 'application/json',
  'User-Agent': 'pibutenten-debug/1.0',
})
with urllib.request.urlopen(req, timeout=30) as resp:
  rows = json.loads(resp.read().decode('utf-8'))
print(f"Total: {len(rows)} rows")
for r in rows:
  print(json.dumps({k: r[k] for k in ('created_at','card_id','display_name','role','handle')}, ensure_ascii=False))
