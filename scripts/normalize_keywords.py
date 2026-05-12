#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DB 의 qas.keywords 전체 카드에 tag-dictionary.ts 의 매핑·블랙리스트 일괄 적용.

매핑/블랙리스트는 src/lib/tag-dictionary.ts 의 export 들을 정규식으로 파싱.
변경된 카드만 UPDATE.
"""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

ROOT = Path(__file__).parent.parent
env_path = ROOT / ".env.local"
TOKEN = None
for line in env_path.read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        TOKEN = line.split("=", 1)[1].strip()
        break
if not TOKEN:
    raise SystemExit("SUPABASE_ACCESS_TOKEN missing")


def run_sql(sql: str) -> list:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        EP,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "pibutenten-migration/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:1000]}")
        raise


# ── tag-dictionary.ts 파싱 ─────────────────────────────────────
dict_path = ROOT / "src" / "lib" / "tag-dictionary.ts"
src = dict_path.read_text(encoding="utf-8")

# TAG_MAPPINGS
mappings_section = re.search(
    r"export const TAG_MAPPINGS[^=]*=\s*\{(.*?)\};",
    src,
    re.DOTALL,
)
assert mappings_section, "TAG_MAPPINGS not found"
mappings: dict[str, list[str]] = {}
for m in re.finditer(
    r'"([^"]+)"\s*:\s*\[([^\]]*)\]',
    mappings_section.group(1),
):
    key = m.group(1)
    items = re.findall(r'"([^"]+)"', m.group(2))
    mappings[key] = items

# TAG_BLACKLIST
bl_section = re.search(
    r"export const TAG_BLACKLIST[^=]*=\s*new Set\(\[(.*?)\]\);",
    src,
    re.DOTALL,
)
assert bl_section, "TAG_BLACKLIST not found"
blacklist = set(re.findall(r'"([^"]+)"', bl_section.group(1)))

print(f"loaded {len(mappings)} mappings, {len(blacklist)} blacklist entries")


def normalize_tag(raw: str) -> list[str]:
    v = (raw or "").strip().lstrip("#")
    if not v:
        return []
    if v in blacklist:
        return []
    if v in mappings:
        return mappings[v]
    return [v]


def normalize_tags(tags) -> list[str]:
    out: list[str] = []
    seen = set()
    for raw in tags or []:
        for norm in normalize_tag(raw):
            if norm and norm not in seen:
                seen.add(norm)
                out.append(norm)
    return out


# ── 모든 카드 keywords fetch ───────────────────────────────────
rows = run_sql(
    "select id, keywords from public.qas where status='published' and keywords is not null"
)
print(f"fetched {len(rows)} published cards")

changes = []
for r in rows:
    rid = r["id"]
    orig = r.get("keywords") or []
    new = normalize_tags(orig)
    if list(orig) != list(new):
        changes.append((rid, orig, new))

print(f"need to update {len(changes)} cards")

# diff sample
for rid, orig, new in changes[:5]:
    print(f"  #{rid}: {orig} → {new}")

if not changes:
    print("nothing to do")
    sys.exit(0)

# ── 배치 UPDATE (in:[] for kw arrays). 한 번에 50개씩 묶음 ────
def lit_array(arr: list[str]) -> str:
    items = [s.replace("'", "''") for s in arr]
    inner = ",".join(f'"{s}"' for s in items)
    return f"'{{{inner}}}'::text[]"


BATCH = 30
total = 0
for i in range(0, len(changes), BATCH):
    batch = changes[i : i + BATCH]
    cases = []
    ids = []
    for rid, _, new in batch:
        cases.append(f"when id={rid} then {lit_array(new)}")
        ids.append(str(rid))
    sql = (
        "update public.qas set keywords = case "
        + " ".join(cases)
        + f" end where id in ({','.join(ids)})"
    )
    run_sql(sql)
    total += len(batch)
    print(f"  batch {i // BATCH + 1}: updated {len(batch)} (total {total})")

print(f"=== DONE — {total} cards updated ===")
