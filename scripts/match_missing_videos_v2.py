#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
누락 영상 카드 28개에 video_id 매칭 v2 — video_meta_utf8.txt 사용.

video_meta_utf8.txt 형식: YYYYMMDD|youtubeId|영상 제목 (의사 이름 포함)
매칭: doctor 이름 + 카드 created_at 근처 영상 + 제목 일치도
"""
import json
import re
import sys
import urllib.request
from pathlib import Path
from datetime import date

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


# 1) DB 누락 카드 조회
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

# 2) video_meta_utf8.txt 파싱
meta_path = PROJECT_ROOT / "video_meta_utf8.txt"
videos = []  # list of {date: YYYY-MM-DD, yt, title}
with meta_path.open("r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        parts = line.split("|", 2)
        if len(parts) != 3: continue
        d_str, yt, title = parts
        if not re.match(r"^\d{8}$", d_str): continue
        if not re.match(r"^[A-Za-z0-9_-]{11}$", yt): continue
        try:
            d = date(int(d_str[0:4]), int(d_str[4:6]), int(d_str[6:8]))
            videos.append({"date": d, "yt": yt, "title": title})
        except Exception:
            pass
print(f"video_meta_utf8.txt: {len(videos)} 영상\n")

DOCTOR_NAMES = ["정한미", "김종식", "고혜림", "이도영", "박효진", "권수현", "김수형", "강현진", "배정민"]

# 3) 카드별 매칭
matches = []
unmatched = []

for q in rows:
    qa_id = q["qa_id"]
    doctor = q["doctor_name"]
    created_str = q["created"]
    try:
        ya, ma, da = map(int, created_str.split("-"))
        qa_date = date(ya, ma, da)
    except Exception:
        unmatched.append(q)
        continue

    # meta.video_title (도움됨)
    meta = q.get("meta")
    if isinstance(meta, str):
        try: meta = json.loads(meta)
        except: meta = {}
    qa_title = (meta or {}).get("video_title", "") or ""

    # 매칭 후보: doctor 이름이 영상 제목에 포함되고 created_at과 가까운 영상
    candidates = []
    for v in videos:
        if doctor not in v["title"]:
            continue
        diff = abs((qa_date - v["date"]).days)
        # 제목 단어 일치도
        score = 0
        if qa_title:
            qa_words = re.findall(r"[가-힣A-Za-z0-9]+", qa_title)
            for w in qa_words:
                # 의사 이름은 score에서 제외 (중복 방지)
                if w and w not in DOCTOR_NAMES and w in v["title"]:
                    score += 1
        candidates.append({
            "yt": v["yt"],
            "video_date": v["date"],
            "title": v["title"],
            "date_diff": diff,
            "title_score": score,
        })

    # 정렬: title_score 높음 → date_diff 작음
    candidates.sort(key=lambda c: (-c["title_score"], c["date_diff"]))
    # 7일 이내만 신뢰
    candidates = [c for c in candidates if c["date_diff"] <= 14]
    if candidates:
        best = candidates[0]
        matches.append({
            "qa_id": qa_id,
            "doctor": doctor,
            "qa_created": created_str,
            "qa_title": qa_title,
            "yt": best["yt"],
            "video_date": best["video_date"].isoformat(),
            "video_title": best["title"],
            "date_diff": best["date_diff"],
            "title_score": best["title_score"],
        })
    else:
        unmatched.append({"qa_id": qa_id, "doctor": doctor, "created": created_str, "qa_title": qa_title})


print("=" * 90)
print(f"[매칭 결과] {len(matches)}/{len(rows)}")
print("=" * 90)
for m in matches:
    print(f"qa#{m['qa_id']} [{m['doctor']}] {m['qa_created']}")
    print(f"  qa_title: {m['qa_title'][:50]}")
    print(f"  → yt={m['yt']} ({m['video_date']}, diff={m['date_diff']}일, score={m['title_score']})")
    print(f"  영상 제목: {m['video_title'][:70]}")
    print()

if unmatched:
    print("=" * 90)
    print(f"[매칭 실패] {len(unmatched)}건")
    print("=" * 90)
    for u in unmatched:
        print(f"qa#{u['qa_id']} [{u['doctor']}] {u['created']} — {u.get('qa_title','')[:50]}")

# 4) SQL UPDATE 출력 (--apply 옵션이면 실행)
print()
print("=" * 90)
print("[SQL UPDATE] 생성")
print("=" * 90)

if not matches:
    sys.exit(0)

# 4-A. videos UPSERT
unique_yts: dict[str, str] = {}  # yt → topic
for m in matches:
    if m["yt"] not in unique_yts:
        unique_yts[m["yt"]] = m["video_title"]

videos_values = ",\n".join(
    f"  ('{yt}', 'https://www.youtube.com/watch?v={yt}', $${topic.replace('$$', '')}$$, '{[mm for mm in matches if mm['yt']==yt][0]['video_date']}')"
    for yt, topic in unique_yts.items()
)
upsert_sql = f"""
insert into public.videos (youtube_id, youtube_url, topic, upload_date)
values
{videos_values}
on conflict (youtube_id) do update
  set topic = coalesce(public.videos.topic, excluded.topic),
      upload_date = coalesce(public.videos.upload_date, excluded.upload_date),
      youtube_url = excluded.youtube_url
returning id, youtube_id;
"""
print(f"-- {len(unique_yts)} videos UPSERT")

# 4-B. qas UPDATE
ts_seconds_by_qa = {}  # qa_id → start_seconds (URL에 ?t= 붙임)
for q in rows:
    meta = q.get("meta")
    if isinstance(meta, str):
        try: meta = json.loads(meta)
        except: meta = {}
    ts = (meta or {}).get("timestamp", {})
    sec = (ts or {}).get("start_seconds")
    if isinstance(sec, (int, float)):
        ts_seconds_by_qa[q["qa_id"]] = int(sec)

case_url = "\n".join(
    f"    when id = {m['qa_id']} then 'https://www.youtube.com/watch?v={m['yt']}'"
    + (f" || '&t={ts_seconds_by_qa[m['qa_id']]}s'" if m['qa_id'] in ts_seconds_by_qa else "")
    for m in matches
)
case_image = "\n".join(
    f"    when id = {m['qa_id']} then 'https://i.ytimg.com/vi/{m['yt']}/hqdefault.jpg'"
    for m in matches
)
case_title = "\n".join(
    f"    when id = {m['qa_id']} then $${m['video_title'].replace('$$','')}$$"
    for m in matches
)
case_video_id = "\n".join(
    f"    when id = {m['qa_id']} then (select id from public.videos where youtube_id = '{m['yt']}')"
    for m in matches
)
ids_csv = ",".join(str(m["qa_id"]) for m in matches)

update_sql = f"""
update public.qas
set
  external_url = case
{case_url}
  end,
  external_image = case
{case_image}
  end,
  external_title = case
{case_title}
  end,
  external_site_name = 'YouTube',
  video_id = case
{case_video_id}
  end,
  updated_at = now()
where id in ({ids_csv});
"""

# 적용
if "--apply" in sys.argv:
    print("--- 실제 적용 시작 ---")
    res = run(upsert_sql)
    print(f"videos UPSERT 완료: {len(res)} row")
    res2 = run(update_sql)
    print(f"qas UPDATE 완료")
    # 검증
    ver_sql = "select count(*) filter (where video_id is null) as still_null, count(*) as total from public.qas;"
    print(json.dumps(run(ver_sql), indent=2, ensure_ascii=False))
else:
    print()
    print("--apply 옵션 없음 — dry-run. 적용하려면 다시 --apply 로 실행.")
    print(f"\n[SQL 미리보기 첫 부분]")
    print(upsert_sql[:1500])
    print("\n--- qas UPDATE 미리보기 ---")
    print(update_sql[:1500])
