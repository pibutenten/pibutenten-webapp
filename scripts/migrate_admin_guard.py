#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
admin API 권한 검사를 requireAdmin() 헬퍼로 일괄 교체.
Phase 9: profiles.eq("id", user.id) → 묶음(auth_user_id) 기준 검사.
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).parent.parent
API_DIR = ROOT / "src" / "app" / "api" / "admin"

# 'admin only' 패턴 — 8개 파일 (pubmed-by-pmid는 admin+doctor 라 별도)
TARGETS = [
    API_DIR / "draft" / "step1" / "route.ts",
    API_DIR / "draft" / "step2" / "route.ts",
    API_DIR / "draft" / "analyze" / "route.ts",
    API_DIR / "draft" / "save" / "route.ts",
    API_DIR / "draft" / "publish" / "route.ts",
    API_DIR / "draft" / "route.ts",
    API_DIR / "youtube-oauth" / "start" / "route.ts",
    API_DIR / "youtube-oauth" / "status" / "route.ts",
]

# 매칭할 블록 패턴 (multiline):
#   const { data: { user } } = await supabase.auth.getUser();
#   if (!user) return ...;
#   const { data: profile } = await supabase
#     .from("profiles")
#     .select("role")
#     .eq("id", user.id)
#     .maybeSingle();    [또는 .single()]
#   if (profile?.role !== "admin" ...) { return ... }
BLOCK_RE = re.compile(
    r"""
    \s+const\s*\{\s*data:\s*\{\s*user\s*\}\s*(?:,\s*error[^}]*)?\}\s*=\s*await\s+supabase\.auth\.getUser\(\)\s*;\s*
    if\s*\([^)]*user[^)]*\)\s*\{[^}]*\}\s*
    const\s*\{\s*data:\s*profile[^}]*\}\s*=\s*await\s+supabase\s*
    \.from\("profiles"\)\s*
    \.select\("role"\)\s*
    \.eq\("id",\s*[\w.]+\)\s*
    \.(?:maybeSingle|single)\(\)\s*;\s*
    if\s*\([^)]*profile[^)]*role[^)]*!==?\s*"admin"[^)]*\)\s*\{[^}]*\}\s*
    """,
    re.VERBOSE | re.DOTALL,
)

# 더 간단한 대체 — 한 줄로
REPLACEMENT = """
  const _guard = await requireAdmin();
  if (!_guard.ok) return _guard.response;
"""

IMPORT_LINE = 'import { requireAdmin } from "@/lib/admin-guard";\n'

changed = 0
for fp in TARGETS:
    if not fp.exists():
        print(f"SKIP (missing): {fp}")
        continue
    src = fp.read_text(encoding="utf-8")
    m = BLOCK_RE.search(src)
    if not m:
        print(f"NO MATCH: {fp.relative_to(ROOT)}")
        continue
    new_src = src[: m.start()] + REPLACEMENT.rstrip() + src[m.end():]
    # import 추가 (이미 있으면 skip)
    if "from \"@/lib/admin-guard\"" not in new_src:
        # 첫 import 줄 다음에 끼워넣기
        lines = new_src.splitlines(keepends=True)
        out_lines = []
        inserted = False
        for i, line in enumerate(lines):
            out_lines.append(line)
            if (
                not inserted
                and line.startswith("import ")
                and (i + 1 >= len(lines) or not lines[i + 1].startswith("import "))
            ):
                out_lines.append(IMPORT_LINE)
                inserted = True
        new_src = "".join(out_lines)
    fp.write_text(new_src, encoding="utf-8")
    print(f"OK: {fp.relative_to(ROOT)}")
    changed += 1

print(f"\nDone: {changed}/{len(TARGETS)} files updated")
