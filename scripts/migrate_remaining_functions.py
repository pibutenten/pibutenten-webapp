#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
남은 23개 함수의 body 안에 qas/qa_* 참조를 cards/card_* 로 일괄 치환 → 재생성.
이후 compat view 들 DROP 가능.
"""
import json, re, sys, urllib.request, urllib.error
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

def run_sql(sql):
    req = urllib.request.Request(EP, data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST", headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "pibutenten-migration/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        print(f"  ERROR: {body[:300]}")
        return None

# 1. 모든 함수의 body 가져오기
list_sql = """
SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
       pg_catalog.pg_get_functiondef(p.oid) AS def
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (
    pg_catalog.pg_get_functiondef(p.oid) ILIKE '%public.qas%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%public.qa_%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%FROM qas%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%FROM qa_%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '% qas %'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%qa_id%'
  )
ORDER BY p.proname;
"""
rows = run_sql(list_sql)
if not rows:
    print("Failed to list functions")
    sys.exit(1)

print(f"Found {len(rows)} functions to migrate\n")

# 2. 각 함수 body 치환 + 재생성
SUBS = [
    (r'\bpublic\.qas\b', 'public.cards'),
    (r'\bpublic\.qa_views\b', 'public.card_views'),
    (r'\bpublic\.qa_likes\b', 'public.card_likes'),
    (r'\bpublic\.qa_saves\b', 'public.card_saves'),
    (r'\bpublic\.qa_shares\b', 'public.card_shares'),
    (r'\bpublic\.qa_impressions\b', 'public.card_impressions'),
    (r'\bpublic\.qa_ratings\b', 'public.card_ratings'),
    (r'\bFROM qas\b', 'FROM cards'),
    (r'\bfrom qas\b', 'from cards'),
    (r'\bJOIN qas\b', 'JOIN cards'),
    (r'\bjoin qas\b', 'join cards'),
    (r'\bqa_views\b', 'card_views'),
    (r'\bqa_likes\b', 'card_likes'),
    (r'\bqa_saves\b', 'card_saves'),
    (r'\bqa_shares\b', 'card_shares'),
    (r'\bqa_impressions\b', 'card_impressions'),
    (r'\bqa_ratings\b', 'card_ratings'),
    (r'\bqa_id\b', 'card_id'),
    (r'\bNEW\.qa_id\b', 'NEW.card_id'),
    (r'\bOLD\.qa_id\b', 'OLD.card_id'),
]

ok, fail = 0, 0
for r in rows:
    name = r['proname']
    args = r['args']
    new_def = r['def']
    for pat, repl in SUBS:
        new_def = re.sub(pat, repl, new_def)
    if new_def == r['def']:
        print(f"  [skip] {name}({args}) — no changes after substitution")
        continue
    res = run_sql(new_def)
    if res is None:
        fail += 1
        print(f"  [FAIL] {name}({args})")
    else:
        ok += 1
        print(f"  [ok]   {name}({args})")

print(f"\nDone: {ok} ok, {fail} failed")
