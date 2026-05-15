#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
PROJECT_REF = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_PROJECT_REF=')), None)
EP = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'

# 스크린샷에 보인 글 — 팔자 주름 보톡스/쥬브젠
sql = """
WITH target AS (
  SELECT id, question
  FROM public.cards
  WHERE question LIKE '팔자 주름%' OR question LIKE '%팔자%주름%'
  ORDER BY created_at DESC
  LIMIT 5
)
SELECT
  t.id AS card_id,
  t.question,
  l.user_id,
  l.created_at,
  p.display_name,
  p.role,
  p.handle,
  p.auth_user_id
FROM target t
LEFT JOIN public.card_likes l ON l.card_id = t.id
LEFT JOIN public.profiles p ON p.id = l.user_id
ORDER BY t.id, l.created_at;
"""
body = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(EP, data=body, method='POST', headers={
  'Authorization': f'Bearer {TOKEN}',
  'Content-Type': 'application/json',
  'User-Agent': 'pibutenten-debug/1.0',
})
with urllib.request.urlopen(req, timeout=30) as resp:
  rows = json.loads(resp.read().decode('utf-8'))
print(f"Total rows: {len(rows)}")
for r in rows:
  print('---')
  for k, v in r.items():
    print(f'  {k}: {v}')
