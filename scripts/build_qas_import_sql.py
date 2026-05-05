#!/usr/bin/env python3
"""
Q&A_백업/*.txt → Supabase SQL 마이그레이션 변환기.

사용:
    python scripts/build_qas_import_sql.py

출력:
    supabase/migrations/0004_qas_import.sql

설계:
- 등록 9명 원장만 필터링 (CLAUDE.md DOCTORS)
- 출처시점은 무시 (사용자 요청: 영상 시작점부터)
- youtube_url 의 ?t=Xs / &t=Xs 파라미터 제거
- videos: on conflict (youtube_id) do nothing
- qas: where not exists (video_id, question) 가드로 중복 방지
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# ---------- 설정 ----------
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
QA_DIR = REPO_ROOT / "Q&A_백업"
OUT_FILE = (
    Path(__file__).resolve().parent.parent
    / "supabase"
    / "migrations"
    / "0004_qas_import.sql"
)

DOCTOR_TO_SLUG: dict[str, str] = {
    "정한미": "jeonghanmi",
    "배정민": "baejungmin",
    "권수현": "kwonsuhyun",
    "김수형": "kimsoohyung",
    "고혜림": "gohyerim",
    "김종식": "kimjongsik",
    "이도영": "leedoyoung",
    "강현진": "kanghyunjin",
    "박효진": "parkhyojin",
}
REGISTERED = set(DOCTOR_TO_SLUG.keys())


# ---------- 파서 ----------
HEADER_RE = re.compile(
    r"^영상 ID:\s*(\S+)\s*$.*?"
    r"^URL:\s*(\S+)\s*$.*?"
    r"^업로드:\s*(\S+)\s*$.*?"
    r"^주제:\s*(.+?)\s*$",
    re.S | re.M,
)
QA_BLOCK_RE = re.compile(
    r"##\s*Q\.\s*(?P<question>.+?)\s*\n+"
    r"A\.\s*(?P<answer>.+?)\s*\n+"
    r"답변:\s*피부과\s*전문의\s*(?P<doctor>\S+)\s*원장\s*\n+"
    r"키워드:\s*(?P<keywords>.+?)\s*\n+"
    r"메타:\s*(?P<meta>.+?)(?:\s*\n+출처시점:\s*\S+)?\s*\n",
    re.S,
)


def strip_url_timestamp(url: str) -> str:
    """youtube URL에서 t= 파라미터 제거."""
    url = re.sub(r"[?&]t=\d+s?", "", url)
    # ?만 남으면 제거
    url = re.sub(r"\?$", "", url)
    return url


def parse_file(path: Path) -> tuple[dict, list[dict]]:
    text = path.read_text(encoding="utf-8")
    h = HEADER_RE.search(text)
    if not h:
        raise ValueError(f"헤더 파싱 실패: {path.name}")

    video = {
        "youtube_id": h.group(1).strip(),
        "youtube_url": strip_url_timestamp(h.group(2).strip()),
        "upload_date": h.group(3).strip(),
        "topic": h.group(4).strip(),
    }

    qas = []
    for m in QA_BLOCK_RE.finditer(text):
        doctor = m.group("doctor").strip()
        if doctor not in REGISTERED:
            continue
        keywords = [
            kw.strip()
            for kw in m.group("keywords").split(",")
            if kw.strip()
        ]
        qas.append(
            {
                "question": m.group("question").strip(),
                "answer": m.group("answer").strip(),
                "doctor": doctor,
                "doctor_slug": DOCTOR_TO_SLUG[doctor],
                "keywords": keywords,
                "meta": m.group("meta").strip(),
            }
        )

    return video, qas


# ---------- SQL 생성 ----------
def sql_quote(s: str) -> str:
    """SQL string literal로 안전하게 변환. ' → ''"""
    if s is None:
        return "null"
    return "'" + s.replace("'", "''") + "'"


def sql_text_array(items: list[str]) -> str:
    """Postgres text[] literal."""
    if not items:
        return "array[]::text[]"
    parts = [sql_quote(x) for x in items]
    return "array[" + ", ".join(parts) + "]::text[]"


def main() -> int:
    if not QA_DIR.exists():
        print(f"[ERR] Q&A_백업 폴더 없음: {QA_DIR}", file=sys.stderr)
        return 1

    files = sorted(QA_DIR.glob("*.txt"))
    if not files:
        print(f"[ERR] .txt 파일 0개", file=sys.stderr)
        return 1

    videos: list[dict] = []
    qa_rows: list[dict] = []
    skipped_unregistered = 0
    parse_errors: list[str] = []

    for f in files:
        try:
            v, qs = parse_file(f)
        except Exception as e:
            parse_errors.append(f"{f.name}: {e}")
            continue
        videos.append(v)
        for q in qs:
            qa_rows.append({**q, "youtube_id": v["youtube_id"]})

    print(f"파일 {len(files)}개 읽음")
    print(f"  videos {len(videos)}개")
    print(f"  qas {len(qa_rows)}개 (등록 9명)")
    if parse_errors:
        print(f"  파싱 에러 {len(parse_errors)}건:")
        for e in parse_errors[:5]:
            print(f"    {e}")

    # ---------- SQL 작성 ----------
    OUT_DIR = OUT_FILE.parent
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1) videos
    videos_sql: list[str] = []
    videos_sql.append(
        "-- =============================================================\n"
        f"-- 0004a. videos 일괄 임포트 ({len(videos)}개)\n"
        "-- 자동 생성: scripts/build_qas_import_sql.py\n"
        "-- 적용: SQL Editor에 통째로 붙여넣고 Run\n"
        "-- =============================================================\n\n"
        "insert into public.videos "
        "(youtube_id, youtube_url, topic, upload_date) values\n"
    )
    rows = []
    for v in videos:
        rows.append(
            "  ("
            f"{sql_quote(v['youtube_id'])}, "
            f"{sql_quote(v['youtube_url'])}, "
            f"{sql_quote(v['topic'])}, "
            f"{sql_quote(v['upload_date'])}::date)"
        )
    videos_sql.append(",\n".join(rows))
    videos_sql.append("\non conflict (youtube_id) do nothing;\n")

    videos_path = OUT_DIR / "0004a_videos.sql"
    videos_path.write_text("".join(videos_sql), encoding="utf-8")
    print(
        f"\n출력: {videos_path.name} "
        f"({videos_path.stat().st_size / 1024:.1f} KB)"
    )

    # 2) qas 청크 분할 (한 청크당 N개) — SQL Editor 안전 한도 고려
    CHUNK_SIZE = 300
    chunk_count = (len(qa_rows) + CHUNK_SIZE - 1) // CHUNK_SIZE

    for ci in range(chunk_count):
        chunk = qa_rows[ci * CHUNK_SIZE : (ci + 1) * CHUNK_SIZE]
        part_no = ci + 1

        sql: list[str] = []
        sql.append(
            "-- =============================================================\n"
            f"-- 0004b_qas_part{part_no:02d}.sql "
            f"({len(chunk)}개 / 전체 {len(qa_rows)}개 중 {ci+1}/{chunk_count})\n"
            "-- 자동 생성: scripts/build_qas_import_sql.py\n"
            "-- ⚠ 0004a_videos.sql 적용 후 실행\n"
            "-- =============================================================\n\n"
            "with new_qas("
            "youtube_id, doctor_slug, question, answer, meta, keywords"
            ") as (\n  values\n"
        )
        rs = []
        for q in chunk:
            rs.append(
                "    ("
                f"{sql_quote(q['youtube_id'])}, "
                f"{sql_quote(q['doctor_slug'])}, "
                f"{sql_quote(q['question'])}, "
                f"{sql_quote(q['answer'])}, "
                f"{sql_quote(q['meta'])}, "
                f"{sql_text_array(q['keywords'])})"
            )
        sql.append(",\n".join(rs))
        sql.append(
            "\n)\n"
            "insert into public.qas "
            "(video_id, doctor_id, question, answer, meta, keywords, published)\n"
            "select v.id, d.id, nq.question, nq.answer, nq.meta, nq.keywords, true\n"
            "from new_qas nq\n"
            "join public.videos  v on v.youtube_id = nq.youtube_id\n"
            "join public.doctors d on d.slug = nq.doctor_slug\n"
            "where not exists (\n"
            "  select 1 from public.qas q\n"
            "  where q.video_id = v.id and q.question = nq.question\n"
            ");\n"
        )

        chunk_path = OUT_DIR / f"0004b_qas_part{part_no:02d}.sql"
        chunk_path.write_text("".join(sql), encoding="utf-8")
        print(
            f"출력: {chunk_path.name} "
            f"({chunk_path.stat().st_size / 1024:.1f} KB)"
        )

    # 단일 통합본은 더 이상 필요 없으므로 제거
    if OUT_FILE.exists():
        OUT_FILE.unlink()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
