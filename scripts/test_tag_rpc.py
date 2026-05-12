#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, urllib.request, urllib.error, sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
TOKEN = next((l.split('=',1)[1].strip() for l in Path('.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('SUPABASE_ACCESS_TOKEN=')), None)
EP = 'https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query'

def q(sql):
    body = json.dumps({'query': sql}).encode('utf-8')
    req = urllib.request.Request(EP, data=body, method='POST', headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'pibutenten-migration/1.0'})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return f'HTTP {e.code}: {e.read().decode("utf-8", errors="ignore")[:600]}'

sql = "select id, round(score::numeric, 4) as s from tag_qas_scored('보톡스', 10, 0, 14, 0.2)"
print('--- call 1 ---')
print(q(sql))
print()
print('--- call 2 ---')
print(q(sql))
print()
print('--- call 3 (jitter 0.5 - stronger) ---')
sql2 = "select id, round(score::numeric, 4) as s from tag_qas_scored('보톡스', 10, 0, 14, 0.5)"
print(q(sql2))
print(q(sql2))
