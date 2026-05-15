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
-- card_likes 모든 trigger
SELECT t.tgname, p.proname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.card_likes'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;
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
  print('---')
  print('NAME:', r.get('tgname'), '| FN:', r.get('proname'))
  print('DEF:', r.get('def'))
