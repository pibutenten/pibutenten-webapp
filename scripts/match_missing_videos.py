#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
누락 영상 카드 28개에 video_id 매칭.

전략:
  1) DB에서 video_id=NULL 카드 28개 조회 (doctor_name + meta.video_title 포함)
  2) todo_videos.csv 읽기 (date, youtubeId, filename — filename에 원장 이름 포함)
  3) 카드의 meta.video_title vs filename 매칭 (또는 doctor + 작성일 인접 매칭)
  4) videos 테이블 UPSERT + qas.external_url + qas.video_id UPDATE

dry-run: 매칭 결과만 출력, 실제 UPDATE는 안 함
"""
import csv
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent.parent
PROJECT_ROOT = ROOT.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
EP = "https://api.supabase.com/v1/projects/nahznfvouuwxqctwlwfs/database/query"


def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-match/1.0",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# 1) DB에서 누락 카드 조회
sql = """
select
  q.id as qa_id,
  q.question,
  d.name as doctor_name,
  d.slug as doctor_slug,
  q.created_at::date as created,
  q.meta
from public.qas q
left join public.doctors d on d.id = q.doctor_id
where q.video_id is null
order by d.name, q.created_at;
"""
rows = run(sql)
print(f"누락 카드 {len(rows)}건\n")

# 2) todo_videos.csv 읽기
csv_path = PROJECT_ROOT / "todo_videos.csv"
videos_map = []  # list of (date_str, yt_id, filename, doctors_in_filename)
with csv_path.open("r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        videos_map.append({
            "date": r["date"],      # YYMMDD
            "yt": r["youtubeId"],
            "filename": r["filename"],
        })
print(f"todo_videos.csv: {len(videos_map)} 영상\n")

# 3) doctor 한글 이름 추출
def extract_doctors_from_filename(fn: str) -> set[str]:
    # 예: 221124_김종식_정한미_울쎄라_VS_써마지.txt
    # 첫 _ 이후, 영상 제목 시작 전 부분 (영상 제목은 한글이지만 _로 끝나는 의사 이름 다음)
    parts = fn.split("_")
    if len(parts) < 2:
        return set()
    # 첫 token은 날짜 (YYMMDD)
    doctors = set()
    # 의사 이름 목록 (수동)
    DOCTOR_NAMES = {"정한미", "김종식", "고혜림", "이도영", "박효진", "권수현", "김수형", "강현진", "배정민"}
    for tok in parts[1:]:
        if tok in DOCTOR_NAMES:
            doctors.add(tok)
        else:
            # 의사 이름은 보통 앞쪽에 연속 — 다른 토큰 나오면 종료
            if doctors:
                break
    return doctors


# 4) 카드별 매칭
matches = []  # (qa_id, doctor_name, qa_created, yt_id, video_filename)
unmatched = []

for q in rows:
    qa_id = q["qa_id"]
    doctor = q["doctor_name"]
    created = q["created"]  # YYYY-MM-DD
    qa_title = ""
    meta = q.get("meta")
    if isinstance(meta, str):
        try: meta = json.loads(meta)
        except: meta = {}
    if isinstance(meta, dict):
        qa_title = meta.get("video_title", "") or ""

    # 매칭: filename에 doctor 이름 포함 + 카드 작성 날짜 근처
    candidates = []
    for v in videos_map:
        docs_in_fn = extract_doctors_from_filename(v["filename"])
        if doctor and doctor in docs_in_fn:
            # 날짜 근접도 계산 (filename에서 YYMMDD를 date로)
            try:
                vd_y = int(v["date"][0:2])
                vd_m = int(v["date"][2:4])
                vd_d = int(v["date"][4:6])
                full_yr = 2000 + vd_y
                video_date = f"{full_yr:04d}-{vd_m:02d}-{vd_d:02d}"
                # 카드 created_at과 차이
                from datetime import date
                ya, ma, da = map(int, created.split("-"))
                vy, vm, vd = full_yr, vd_m, vd_d
                diff = abs((date(ya, ma, da) - date(vy, vm, vd)).days)
                # 제목 유사도 — qa_title의 단어가 filename에 있으면 +score
                score = 0
                if qa_title:
                    qa_words = re.findall(r"[가-힣A-Za-z0-9]+", qa_title)
                    for w in qa_words:
                        if w and w in v["filename"]:
                            score += 1
                candidates.append({
                    "yt": v["yt"],
                    "filename": v["filename"],
                    "date_diff": diff,
                    "title_score": score,
                    "video_date": video_date,
                })
            except Exception:
                pass

    # 정렬: title_score 높은 것 → date_diff 작은 것
    candidates.sort(key=lambda c: (-c["title_score"], c["date_diff"]))
    if candidates:
        best = candidates[0]
        matches.append({
            "qa_id": qa_id,
            "doctor": doctor,
            "qa_created": created,
            "qa_title": qa_title,
            "yt": best["yt"],
            "filename": best["filename"],
            "date_diff": best["date_diff"],
            "title_score": best["title_score"],
        })
    else:
        unmatched.append({"qa_id": qa_id, "doctor": doctor, "created": created, "qa_title": qa_title})


print("=" * 80)
print(f"[매칭 결과] {len(matches)}/{len(rows)}")
print("=" * 80)
for m in matches:
    print(f"qa#{m['qa_id']} [{m['doctor']}] {m['qa_created']}")
    print(f"  qa_title: {m['qa_title'][:60]}")
    print(f"  → yt={m['yt']} (date_diff={m['date_diff']}일, title_score={m['title_score']})")
    print(f"  filename: {m['filename'][:80]}")
    print()

if unmatched:
    print("=" * 80)
    print(f"[매칭 실패] {len(unmatched)}건")
    print("=" * 80)
    for u in unmatched:
        print(f"qa#{u['qa_id']} [{u['doctor']}] {u['created']}")
        print(f"  qa_title: {u['qa_title'][:60]}")
