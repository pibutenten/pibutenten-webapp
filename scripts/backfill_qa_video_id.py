#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
qas.video_id 백필 — 모든 발행 카드에 videos.id 채움.

전략:
  1) 각 qa의 external_url에서 YouTube ID 추출 (youtu.be/XXX 또는 v=XXX)
     또는 meta.video_id가 있으면 사용
  2) YouTube ID 단위로 videos 테이블에 UPSERT (없으면 INSERT)
  3) qas.video_id = videos.id 로 UPDATE

실행:
  python scripts/backfill_qa_video_id.py            # 미적용 카드만
  python scripts/backfill_qa_video_id.py --all      # 전체 재처리
  python scripts/backfill_qa_video_id.py --dry-run  # SQL만 출력
"""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
if not TOKEN:
    print("ERR: SUPABASE_ACCESS_TOKEN missing in .env.local")
    sys.exit(1)


def run(sql: str):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "pibutenten-backfill/1.0",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_youtube_id(external_url: str, meta_json) -> str | None:
    """external_url 또는 meta.video_id에서 YouTube 11자 ID 추출."""
    if external_url:
        # https://youtu.be/XXX 또는 https://www.youtube.com/watch?v=XXX
        m = re.search(r"(?:youtu\.be/|v=|embed/|/v/)([a-zA-Z0-9_-]{11})", external_url)
        if m:
            return m.group(1)
    if meta_json:
        try:
            meta = meta_json if isinstance(meta_json, dict) else json.loads(meta_json)
            vid = meta.get("video_id")
            if vid and re.match(r"^[a-zA-Z0-9_-]{11}$", vid):
                return vid
        except Exception:
            pass
    return None


def sql_quote(s: str) -> str:
    """SQL 문자열 리터럴로 escape."""
    return s.replace("'", "''")


# 1) 백필 대상 조회 — video_id가 NULL인 모든 카드
target_sql = """
select id, external_url, external_title, meta
from public.qas
where video_id is null
order by id;
"""
print("=" * 60)
print("[1/3] 백필 대상 조회")
print("=" * 60)
rows = run(target_sql)
print(f"video_id 미설정 카드: {len(rows)}개")

if len(rows) == 0:
    print("백필할 카드가 없습니다.")
    sys.exit(0)

# 2) 각 카드에서 YouTube ID 추출 + topic(영상 제목) 모음
yt_to_topic: dict[str, str] = {}  # youtube_id → topic
qa_to_yt: dict[int, str] = {}  # qa.id → youtube_id
missing: list[int] = []

for r in rows:
    qa_id = r["id"]
    yt = extract_youtube_id(r.get("external_url") or "", r.get("meta"))
    if yt:
        qa_to_yt[qa_id] = yt
        # topic은 external_title 또는 meta.video_title 우선
        meta = r.get("meta")
        topic = r.get("external_title") or ""
        if meta:
            try:
                m = meta if isinstance(meta, dict) else json.loads(meta)
                topic = m.get("video_title") or topic
            except Exception:
                pass
        if yt not in yt_to_topic or (topic and len(topic) > len(yt_to_topic[yt])):
            yt_to_topic[yt] = topic
    else:
        missing.append(qa_id)

print(f"YouTube ID 추출 성공: {len(qa_to_yt)}개")
print(f"고유 영상 수: {len(yt_to_topic)}개")
print(f"YouTube ID 추출 실패: {len(missing)}개")
if missing:
    print(f"  실패 qa.id: {missing[:20]}{' ...' if len(missing) > 20 else ''}")

# 3) videos UPSERT
print()
print("=" * 60)
print("[2/3] videos UPSERT")
print("=" * 60)
values_sql = ",\n".join(
    f"  ('{yt}', 'https://www.youtube.com/watch?v={yt}', '{sql_quote(topic) if topic else ''}')"
    for yt, topic in yt_to_topic.items()
)
upsert_sql = f"""
insert into public.videos (youtube_id, youtube_url, topic)
values
{values_sql}
on conflict (youtube_id) do update
  set topic = coalesce(public.videos.topic, excluded.topic),
      youtube_url = excluded.youtube_url,
      updated_at = now()
returning id, youtube_id;
"""
if "--dry-run" in sys.argv:
    print("--- DRY RUN: videos UPSERT SQL ---")
    print(upsert_sql[:2000] + ("..." if len(upsert_sql) > 2000 else ""))
else:
    res = run(upsert_sql)
    print(f"UPSERT 완료: {len(res)} videos row")

# 4) videos.id 조회 (UPSERT 결과 매핑)
print()
print("=" * 60)
print("[3/3] qas.video_id 업데이트")
print("=" * 60)
if "--dry-run" in sys.argv:
    print("--- DRY RUN: qas UPDATE SQL 첫 5건 미리보기 ---")
    for i, (qa_id, yt) in enumerate(list(qa_to_yt.items())[:5]):
        print(f"  update qas set video_id = (select id from videos where youtube_id = '{yt}') where id = {qa_id};")
    print(f"  ... 총 {len(qa_to_yt)}건")
    sys.exit(0)

# UPDATE: qa별로 youtube_id로 videos.id를 찾아 set
# 효율을 위해 case-when 일괄 처리
case_sql = "\n".join(
    f"    when id = {qa_id} then (select id from public.videos where youtube_id = '{yt}')"
    for qa_id, yt in qa_to_yt.items()
)
ids_csv = ",".join(str(qa_id) for qa_id in qa_to_yt.keys())
update_sql = f"""
update public.qas
set video_id = case
{case_sql}
end
where id in ({ids_csv})
returning id, video_id;
"""
res = run(update_sql)
print(f"qas.video_id 업데이트 완료: {len(res)}건")

# 검증
verify_sql = """
select count(*) filter (where video_id is null) as still_null,
       count(*) as total
from public.qas;
"""
ver = run(verify_sql)
print()
print("=" * 60)
print("[검증]")
print("=" * 60)
print(json.dumps(ver, indent=2, ensure_ascii=False))
