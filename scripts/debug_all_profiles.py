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
  p.id,
  p.auth_user_id,
  p.role,
  p.handle,
  p.display_name,
  (p.id = p.auth_user_id) AS is_primary,
  da.doctor_id,
  d.slug AS doctor_slug,
  d.name AS doctor_name,
  COUNT(DISTINCT cl.card_id) AS likes_n,
  COUNT(DISTINCT cs.card_id) AS saves_n,
  COUNT(DISTINCT c.id) AS cards_n,
  COUNT(DISTINCT cm.id) AS comments_n
FROM public.profiles p
LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
LEFT JOIN public.doctors d ON d.id = da.doctor_id
LEFT JOIN public.card_likes cl ON cl.user_id = p.id
LEFT JOIN public.card_saves cs ON cs.user_id = p.id
LEFT JOIN public.cards c ON c.author_id = p.id
LEFT JOIN public.comments cm ON cm.author_id = p.id
GROUP BY p.id, p.auth_user_id, p.role, p.handle, p.display_name, da.doctor_id, d.slug, d.name
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

# 묶음별로 그룹화
from collections import defaultdict
groups = defaultdict(list)
for r in rows:
  groups[r['auth_user_id']].append(r)

print(f"=== 전체 profiles {len(rows)}건, 묶음 {len(groups)}개 ===\n")
for auth_id, members in groups.items():
  print(f"### 묶음 auth_user_id = {auth_id}")
  for m in members:
    print(f"  • [{m['role']:<6}] {m['display_name']:<10} (@{m['handle'] or '-':<15})  primary={m['is_primary']}  doctor={m['doctor_slug'] or '-'}")
    print(f"             id={m['id']}")
    print(f"             likes={m['likes_n']}  saves={m['saves_n']}  cards={m['cards_n']}  comments={m['comments_n']}")
  print()
