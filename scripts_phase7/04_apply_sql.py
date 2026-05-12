#!/usr/bin/env python3
"""
Phase 7: Supabase Management API로 SQL 일괄 적용.

사용:
    python scripts_phase7/04_apply_sql.py 01_db_wipe.sql
    python scripts_phase7/04_apply_sql.py 03_insert_cards_part01.sql
    python scripts_phase7/04_apply_sql.py --all  # wipe + 모든 insert part

환경:
    .env.local의 SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF 사용
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ENV_FILE = ROOT / ".env.local"


def load_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("'\"")
    return env


def run_sql(sql: str, token: str, project_ref: str) -> dict:
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = resp.read().decode("utf-8")
            return {"ok": True, "data": data}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode("utf-8", "replace")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def main() -> int:
    env = load_env()
    token = env.get("SUPABASE_ACCESS_TOKEN") or os.environ.get("SUPABASE_ACCESS_TOKEN")
    project_ref = env.get("SUPABASE_PROJECT_REF") or os.environ.get("SUPABASE_PROJECT_REF")
    if not token or not project_ref:
        print("[ERR] SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF 필요", file=sys.stderr)
        return 1

    args = sys.argv[1:]
    if not args:
        print("usage: 04_apply_sql.py <file.sql>|--all")
        return 1

    if args[0] == "--all":
        files = ["01_db_wipe.sql"] + sorted(
            [p.name for p in HERE.glob("03_insert_cards_part*.sql")]
        )
    else:
        files = args

    for fname in files:
        p = HERE / fname
        if not p.exists():
            print(f"[SKIP] {fname} 없음")
            continue
        sql = p.read_text(encoding="utf-8")
        size_kb = len(sql) / 1024
        print(f"=> {fname} ({size_kb:.1f} KB)")
        r = run_sql(sql, token, project_ref)
        if r["ok"]:
            print(f"   OK: {r['data'][:200]}")
        else:
            print(f"   FAIL: {r}")
            return 2

    print("ALL DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
