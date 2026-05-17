#!/usr/bin/env python3
"""
Phase 7: Q&A_백업/*.json → INSERT SQL (qas 테이블).

⚠️ DEPRECATED (2026-05-17): post_slug 정책이 keyword slug 로 통일됨.
이 스크립트가 만드는 `{video_id}-{ordinal}` 형식의 slug 는 더 이상 사용하지 않음.
재import 가 필요하면 PRD §11-A 의 키워드 추출 정책에 맞춰 post_slug 생성 로직을
교체해야 함 (keywords[0:3] → procedure-mappings.json 영문 변환 → '-' join).
기존 import 분은 `scripts_keyword_backfill/` 의 backfill 로 갈아엎음.

설계 (Phase 7 당시 — 레거시):
- 모든 카드: doctor_id = jung-hanmi (UUID 하드코드), type='qa', category='qa',
  status='published', published=true
- post_year = 2000 + filename YY
- created_at/updated_at = filename YYMMDD → 20YY-MM-DD 00:00:00+00 (영상 업로드일)
- post_slug = '{video_id}-{ordinal}' (영상 내 카드 순서 1, 2, 3...) ← ⚠️ deprecated
- external_url = draft.source.video_url
- pubmed_ref = draft.reference (jsonb) or null
- 청크당 250개씩 SQL 분할 (Supabase 안전 한도)

출력: scripts_phase7/03_insert_cards_partXX.sql
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
QA_DIR = ROOT / "Q&A_백업"
OUT_DIR = Path(__file__).resolve().parent

DOCTOR_ID = "93b30a7c-bd6f-4a98-b7fe-2c169cf07962"  # jung-hanmi
CHUNK_SIZE = 250


def sql_quote(s) -> str:
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def sql_dollar(s, tag: str) -> str:
    """E'...' escapes can be brittle on Korean text — use dollar-quoting.

    Caller must guarantee that tag string doesn't appear in s.
    """
    if s is None:
        return "null"
    return f"${tag}${s}${tag}$"


def sql_text_array(items: list) -> str:
    if not items:
        return "array[]::text[]"
    return "array[" + ", ".join(sql_quote(x) for x in items) + "]::text[]"


def sql_jsonb(obj) -> str:
    if obj is None:
        return "null"
    return sql_quote(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def slugify(text: str, max_len: int = 50) -> str:
    """alpha-num + hyphen only. Korean is romanized loosely (basic)."""
    text = re.sub(r"[^a-zA-Z0-9\-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-").lower()
    return text[:max_len] or "card"


def parse_date_prefix(filename: str) -> tuple[int, str]:
    """'250220_xxx.json' → (2025, '2025-02-20')"""
    m = re.match(r"^(\d{2})(\d{2})(\d{2})_", filename)
    if not m:
        return (2025, "2025-01-01")
    yy, mm, dd = m.group(1), m.group(2), m.group(3)
    year = 2000 + int(yy)
    return (year, f"{year:04d}-{mm}-{dd}")


def main() -> int:
    if not QA_DIR.exists():
        print(f"[ERR] {QA_DIR} 없음", file=sys.stderr)
        return 1

    files = sorted(QA_DIR.glob("*.json"))
    print(f"파일 {len(files)}개")

    rows: list[dict] = []
    used_slugs: set[str] = set()
    skipped = 0
    parse_errors: list[str] = []

    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            parse_errors.append(f"{f.name}: {e}")
            continue

        drafts = data.get("drafts", data.get("cards", []))
        if not drafts:
            skipped += 1
            continue

        year, date_str = parse_date_prefix(f.name)

        for i, d in enumerate(drafts, start=1):
            question = d.get("question", "").strip()
            answer = d.get("answer", "").strip()
            if not question or not answer:
                continue

            source = d.get("source") or {}
            video_id = source.get("video_id") or "noid"
            video_url = source.get("video_url")

            # slug 생성 + 중복 방지
            base_slug = f"{video_id}-{i}"
            slug = base_slug
            cnt = 1
            while slug in used_slugs:
                cnt += 1
                slug = f"{base_slug}-{cnt}"
            used_slugs.add(slug)

            rows.append({
                "question": question,
                "answer": answer,
                "keywords": d.get("keywords") or [],
                "post_year": year,
                "post_slug": slug,
                "external_url": video_url,
                "pubmed_ref": d.get("reference"),
                "created_at": date_str,
            })

    print(f"카드 {len(rows)}개, 빈 파일 {skipped}, 파싱 에러 {len(parse_errors)}")
    for e in parse_errors[:5]:
        print(f"  ERR: {e}")

    chunk_count = (len(rows) + CHUNK_SIZE - 1) // CHUNK_SIZE
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for ci in range(chunk_count):
        chunk = rows[ci * CHUNK_SIZE: (ci + 1) * CHUNK_SIZE]
        part_no = ci + 1
        lines: list[str] = []
        lines.append(
            f"-- Phase 7 INSERT part {part_no:02d}/{chunk_count} "
            f"({len(chunk)} cards)\n"
            f"-- 자동 생성: scripts_phase7/02_json_to_sql.py\n\n"
            "insert into public.qas\n"
            "  (doctor_id, type, category, status, published,\n"
            "   question, answer, keywords,\n"
            "   post_year, post_slug, external_url, pubmed_ref,\n"
            "   created_at, updated_at)\n"
            "values\n"
        )

        val_rows = []
        for r in chunk:
            # dollar-quote tag: 카드 본문에 나오기 어려운 문자열
            tag_q = "AAQ"
            tag_a = "AAA"
            # 충돌 방지 검증
            if f"${tag_q}$" in r["question"]:
                tag_q = "AAQQ"
            if f"${tag_a}$" in r["answer"]:
                tag_a = "AAAA"

            val_rows.append(
                "  ("
                f"'{DOCTOR_ID}'::uuid, 'qa', 'qa', 'published', true, "
                f"{sql_dollar(r['question'], tag_q)}, "
                f"{sql_dollar(r['answer'], tag_a)}, "
                f"{sql_text_array(r['keywords'])}, "
                f"{r['post_year']}, "
                f"{sql_quote(r['post_slug'])}, "
                f"{sql_quote(r['external_url'])}, "
                f"{sql_jsonb(r['pubmed_ref'])}, "
                f"'{r['created_at']} 00:00:00+00'::timestamptz, "
                f"'{r['created_at']} 00:00:00+00'::timestamptz)"
            )
        lines.append(",\n".join(val_rows))
        lines.append(";\n")

        out = OUT_DIR / f"03_insert_cards_part{part_no:02d}.sql"
        out.write_text("".join(lines), encoding="utf-8")
        print(f"  {out.name} ({out.stat().st_size/1024:.1f} KB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
