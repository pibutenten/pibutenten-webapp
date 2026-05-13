#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
영상 바로가기 누락 카드 전수조사.

발견 케이스:
  1) qas.video_id IS NULL AND external_url 없음 (또는 YouTube URL 아님)
     → 카드 렌더링 시 "영상 보러가기" 안 나타남
  2) qas.video_id 있는데 videos row가 없음 (FK orphan)
     → join 실패로 youtube_url None

QACard.tsx의 영상 링크 우선순위:
  1) Q&A 카테고리 + external_url(youtube)
  2) videos 테이블 join

이 둘 모두 비어있으면 영상 바로가기가 보이지 않는다.

해결:
  - 백필 후보: videos 테이블에서 같은 doctor의 영상 1편이면 자동 매칭
  - 그 외엔 어드민이 카드 편집기에서 video link 채워야 함

실행:
  python scripts/audit_qa_videos.py
"""
import json, sys, urllib.request, urllib.error
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
ROOT = Path(__file__).parent.parent
TOKEN = next(
    (l.split("=", 1)[1].strip() for l in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)
if not TOKEN:
    print("ERR: SUPABASE_ACCESS_TOKEN missing in .env.local")
    sys.exit(1)

def run(sql: str):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "pibutenten-audit/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

# 1) 전체 통계
stats_sql = """
select
  count(*) as total,
  count(*) filter (where video_id is not null) as has_video_id,
  count(*) filter (where external_url is not null and external_url ~ '(youtu\\.be|youtube\\.com|youtube-nocookie\\.com)') as has_yt_external,
  count(*) filter (where video_id is null and (external_url is null or external_url !~ '(youtu\\.be|youtube\\.com|youtube-nocookie\\.com)')) as missing_video_link
from public.qas
where status = 'published'
  and type::text in ('qa','column');
"""
print("─" * 70)
print("[전체 통계]")
print("─" * 70)
stats = run(stats_sql)
print(json.dumps(stats, indent=2, ensure_ascii=False))

# 2) 영상 바로가기 누락 카드 목록 — doctor별 그룹
missing_sql = """
select
  q.id,
  q.question,
  d.name as doctor_name,
  d.slug as doctor_slug,
  q.category,
  q.external_url,
  q.video_id,
  q.created_at::date as created
from public.qas q
left join public.doctors d on d.id = q.doctor_id
where q.status = 'published'
  and q.video_id is null
  and (q.external_url is null or q.external_url !~ '(youtu\\.be|youtube\\.com|youtube-nocookie\\.com)')
order by d.name, q.created_at desc
limit 200;
"""
print()
print("─" * 70)
print("[영상 바로가기 누락 카드]")
print("─" * 70)
missing = run(missing_sql)
print(json.dumps(missing, indent=2, ensure_ascii=False))

# 3) doctor별 자동 백필 후보 — 그 doctor가 video 1편만 만들었을 때 자동 매칭 가능
backfill_sql = """
with doc_video_count as (
  select doctor_id, count(*) as n, min(id) as only_video_id
  from public.videos
  group by doctor_id
  having count(*) = 1
)
select
  q.id as qa_id,
  q.question,
  d.name as doctor_name,
  d.slug as doctor_slug,
  v.youtube_id,
  v.youtube_url
from public.qas q
join public.doctors d on d.id = q.doctor_id
join doc_video_count dvc on dvc.doctor_id = q.doctor_id
join public.videos v on v.id = dvc.only_video_id
where q.status = 'published'
  and q.video_id is null
  and (q.external_url is null or q.external_url !~ '(youtu\\.be|youtube\\.com|youtube-nocookie\\.com)')
order by d.name;
"""
print()
print("─" * 70)
print("[자동 백필 후보 — doctor의 video가 1편만 있는 카드]")
print("─" * 70)
backfill = run(backfill_sql)
print(json.dumps(backfill, indent=2, ensure_ascii=False))

# 4) FK orphan — video_id 있는데 videos row 없는 경우
orphan_sql = """
select q.id, q.question, q.video_id
from public.qas q
left join public.videos v on v.id = q.video_id
where q.video_id is not null and v.id is null
limit 50;
"""
print()
print("─" * 70)
print("[FK orphan — video_id 있는데 videos row 누락]")
print("─" * 70)
orphan = run(orphan_sql)
print(json.dumps(orphan, indent=2, ensure_ascii=False))
