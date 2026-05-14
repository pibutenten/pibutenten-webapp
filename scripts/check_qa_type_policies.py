#!/usr/bin/env python3
import json, urllib.request
from pathlib import Path
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
sql = """
SELECT polname, polrelid::regclass AS table_name, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'public.cards'::regclass
ORDER BY polname;
"""
req = urllib.request.Request('https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query', data=json.dumps({'query':sql}).encode('utf-8'), method='POST', headers={'Authorization':f'Bearer {TOKEN}','Content-Type':'application/json','User-Agent':'pm/1.0'})
with urllib.request.urlopen(req, timeout=60) as r:
    rows = json.loads(r.read().decode('utf-8'))
for r in rows:
    if 'type' in (r.get('using_expr') or '') or 'type' in (r.get('check_expr') or ''):
        print(f"{r['polname']}:")
        print(f"  USING:  {r.get('using_expr')}")
        print(f"  CHECK:  {r.get('check_expr')}")
        print()
