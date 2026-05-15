#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
PROJECT_REF = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_PROJECT_REF=')), None)
EP = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'

# 의사가 작성한 비-qa 글 (cards.doctor_id IS NOT NULL AND category != 'qa')
sql = """
SELECT
  c.id, c.category, c.shortcode, c.post_year, c.post_slug,
  c.question,
  d.slug AS doctor_slug, d.name AS doctor_name,
  p.handle AS author_handle, p.display_name AS author_name
FROM public.cards c
LEFT JOIN public.doctors d ON d.id = c.doctor_id
LEFT JOIN public.profiles p ON p.id = c.author_id
WHERE c.doctor_id IS NOT NULL
  AND c.category IS NOT NULL
  AND c.category != 'qa'
  AND c.status = 'published'
ORDER BY c.created_at DESC
LIMIT 8;
"""
body = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(EP, data=body, method='POST', headers={
  'Authorization': f'Bearer {TOKEN}',
  'Content-Type': 'application/json',
  'User-Agent': 'pibutenten-debug/1.0',
})
with urllib.request.urlopen(req, timeout=30) as resp:
  rows = json.loads(resp.read().decode('utf-8'))
print(f'== 의사 작성 비-Q&A 글: {len(rows)}건 ==\n')
for r in rows:
  q = (r.get('question') or '')[:30]
  print(f"[{r['category']:6}] {r['doctor_name']} - {q}")
  print(f"  card_id={r['id']}  shortcode={r['shortcode']}")
  print(f"  doctor route: /doctors/{r['doctor_slug']}/{r['post_year']}/{r['post_slug']}")
  print(f"  member route: /{r['author_handle']}/{r['shortcode']}")
  print()
