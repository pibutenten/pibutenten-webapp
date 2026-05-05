#!/usr/bin/env python3
"""
PICK 후보 자동 선정 — Supabase REST API로 조회.

규칙:
  - 정한미·이도영: 힐로웨이브, 스컬트라, 티타늄, 쥬브젠, 필러 (각 1개씩, 둘 중 누구든)
  - 권수현, 김수형, 고혜림, 김종식, 강현진: 울쎄라, 써마지, 기타 리프팅, 기타 스킨부스터 (각 4개씩 = 5명×4=20)
  - 배정민: 백반증 5개

출력: src/lib/picks.ts (PICK_IDS Set)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

URL = "https://nahznfvouuwxqctwlwfs.supabase.co"
KEY = "sb_publishable_U684MFgitptXv_GbW0MDhQ_1syN6D2m"

OUT = Path(__file__).resolve().parent.parent / "src" / "lib" / "picks.ts"


def fetch(path: str, params: dict[str, str]) -> list[dict]:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}?{qs}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def doctor_id(slug: str) -> str:
    rows = fetch("doctors", {"slug": f"eq.{slug}", "select": "id"})
    return rows[0]["id"]


def pick_one(doctor_slugs: list[str], keyword: str, used: set[int]) -> int | None:
    """원장 슬러그 후보 + 키워드 매칭. 가장 최근 것 중 used 제외."""
    doctor_ids = [doctor_id(s) for s in doctor_slugs]
    for did in doctor_ids:
        rows = fetch(
            "qas",
            {
                "select": "id,created_at",
                "doctor_id": f"eq.{did}",
                "keywords": f"cs.{{{keyword}}}",
                "published": "eq.true",
                "order": "created_at.desc",
                "limit": "20",
            },
        )
        for r in rows:
            if r["id"] not in used:
                return r["id"]
    return None


def pick_n(doctor_slugs: list[str], keyword: str, n: int, used: set[int]) -> list[int]:
    out = []
    doctor_ids = [doctor_id(s) for s in doctor_slugs]
    for did in doctor_ids:
        rows = fetch(
            "qas",
            {
                "select": "id,created_at",
                "doctor_id": f"eq.{did}",
                "keywords": f"cs.{{{keyword}}}",
                "published": "eq.true",
                "order": "created_at.desc",
                "limit": "30",
            },
        )
        for r in rows:
            if r["id"] not in used and r["id"] not in out:
                out.append(r["id"])
                if len(out) >= n:
                    return out
    return out


def pick_lifting_or_injection(doctor_slug: str, n: int, used: set[int]) -> list[int]:
    """울쎄라/써마지 외, 리프팅·스킨부스터 카테고리에서 n개."""
    did = doctor_id(doctor_slug)
    candidates = [
        "올타이트", "엔디미", "미라젯", "엠페이스", "세르프", "제네시스", "올리지오",
        "쥬베룩", "리쥬란", "힐로웨이브", "리쥬란HB", "콜라겐자극제", "스킨부스터",
        "보톡스", "필러",
    ]
    out = []
    for kw in candidates:
        rows = fetch(
            "qas",
            {
                "select": "id",
                "doctor_id": f"eq.{did}",
                "keywords": f"cs.{{{kw}}}",
                "published": "eq.true",
                "order": "created_at.desc",
                "limit": "5",
            },
        )
        for r in rows:
            if r["id"] not in used and r["id"] not in out:
                out.append(r["id"])
                if len(out) >= n:
                    return out
    return out


def main() -> int:
    used: set[int] = set()
    picks_by_doctor: dict[str, list[int]] = {}

    # 1) 정한미·이도영 — 각자 5개 픽 (5종 주제 × 각 1개씩)
    #    이도영에 쥬브젠 글 없으면 '세르프' fallback
    star_topics_jh = ["힐로웨이브", "스컬트라", "티타늄리프팅", "쥬브젠", "필러"]
    star_topics_ld = ["힐로웨이브", "스컬트라", "티타늄리프팅", "쥬브젠", "필러"]

    for slug, topics in [("jeonghanmi", star_topics_jh), ("leedoyoung", star_topics_ld)]:
        for kw in topics:
            pid = pick_one([slug], kw, used)
            # 티타늄리프팅 → 티타늄 fallback
            if not pid and kw == "티타늄리프팅":
                pid = pick_one([slug], "티타늄", used)
            # 쥬브젠 → 세르프 fallback
            if not pid and kw == "쥬브젠":
                pid = pick_one([slug], "세르프", used)
            if pid:
                used.add(pid)
                picks_by_doctor.setdefault(slug, []).append(pid)
                print(f"[star] {slug} × {kw} → #{pid}")
            else:
                print(f"[star] {slug} × {kw} → 매칭 없음")

    # 2) 권수현, 김수형, 고혜림, 김종식, 강현진 — 울쎄라·써마지·리프팅·스킨부스터 4개
    others = ["kwonsuhyun", "kimsoohyung", "gohyerim", "kimjongsik", "kanghyunjin"]
    for slug in others:
        bag = []
        # 울쎄라
        bag += pick_n([slug], "울쎄라", 1, used.union(set(bag)))
        # 써마지
        bag += pick_n([slug], "써마지", 1, used.union(set(bag)))
        # 리프팅·스킨부스터 기타에서 2개 더
        more = pick_lifting_or_injection(slug, 2, used.union(set(bag)))
        bag += more
        bag = bag[:4]
        for p in bag:
            used.add(p)
        picks_by_doctor[slug] = bag
        print(f"[other] {slug} → {bag}")

    # 3) 배정민 — 백반증 5개
    bag = []
    for kw in ["백반증", "백반증치료", "옵젤루라"]:
        more = pick_n(["baejungmin"], kw, 5 - len(bag), used.union(set(bag)))
        bag += more
        if len(bag) >= 5:
            break
    bag = bag[:5]
    for p in bag:
        used.add(p)
    picks_by_doctor["baejungmin"] = bag
    print(f"[bae] baejungmin → {bag}")

    # 출력 TS 파일
    OUT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "/**",
        " * 자동 생성된 PICK 목록 (scripts/select_picks.py).",
        " * 각 원장님별 추천 글. QACard에 Pick 배지 표시용.",
        " */",
        "",
        "export const PICK_IDS_BY_DOCTOR: Record<string, number[]> = {",
    ]
    for slug, ids in picks_by_doctor.items():
        if not ids:
            continue
        lines.append(f"  {slug}: [{', '.join(str(i) for i in ids)}],")
    lines.append("};")
    lines.append("")
    lines.append(
        "export const PICK_IDS: Set<number> = new Set("
        "Object.values(PICK_IDS_BY_DOCTOR).flat());"
    )
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    total = sum(len(v) for v in picks_by_doctor.values())
    print(f"\n총 {total}개 pick → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
