#!/usr/bin/env python3
import json, urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).parent.parent
TOKEN = next((l.split('=',1)[1].strip() for l in (ROOT/'.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
sql = (ROOT/'supabase/migrations/0073_notifications_rpc_card_id.sql').read_text(encoding='utf-8')
req = urllib.request.Request('https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query', data=json.dumps({'query':sql}).encode('utf-8'), method='POST', headers={'Authorization':f'Bearer {TOKEN}','Content-Type':'application/json','User-Agent':'pm/1.0'})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        print(r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8'))
