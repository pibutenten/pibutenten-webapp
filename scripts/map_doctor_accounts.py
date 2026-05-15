#!/usr/bin/env python3
"""doctor_accounts 매핑 일괄 처리:
- 사과(profile) → 김종식 원장님(kim-jongsic)
- 너구리(u-x3x6fb) → 정한미 원장님(jung-hanmi)
"""
import json, urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')

PROJECT_REF = "nahznfvouuwxqctwlwfs"
EP = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
TOKEN = next(
    (l.split("=", 1)[1].strip()
     for l in Path('.env.local').read_text(encoding='utf-8').splitlines()
     if l.startswith("SUPABASE_ACCESS_TOKEN=")),
    None,
)

def run(sql):
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(EP, data=body, method="POST", headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "pibutenten-migration/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

MAPPINGS = [
    # (profile 식별 SQL where, doctor slug, label)
    ("display_name = '사과'", 'kim-jongsic', '사과 → 김종식'),
    ("handle = 'u-x3x6fb'", 'jung-hanmi', '너구리(u-x3x6fb) → 정한미'),
]

for prof_where, doc_slug, label in MAPPINGS:
    print(f"\n========== {label} ==========")
    # profile 후보 조회 (중복 가능성 확인)
    rows = run(f"select id, handle, display_name, role from profiles where {prof_where};")
    if not rows:
        print(f"  ❌ profile not found: WHERE {prof_where}")
        continue
    if len(rows) > 1:
        print(f"  ⚠️ multiple profiles matched:")
        for r in rows:
            print(f"    id={r['id'][:8]}... handle={r['handle']} name={r['display_name']}")
        print(f"  → skipped (ambiguous, manual handling needed)")
        continue
    p = rows[0]
    profile_id = p['id']
    print(f"  profile: id={profile_id[:8]}... handle={p['handle']} name={p['display_name']} role={p['role']}")

    rows = run(f"select id, slug, name from doctors where slug = '{doc_slug}';")
    if not rows:
        print(f"  ❌ doctor not found: slug={doc_slug}")
        continue
    d = rows[0]
    doctor_id = d['id']
    print(f"  doctor:  id={doctor_id[:8]}... slug={d['slug']} name={d['name']}")

    # 기존 매핑 확인
    rows = run(f"""
      select da.profile_id, p.handle, p.display_name
      from doctor_accounts da
      join profiles p on p.id = da.profile_id
      where da.doctor_id = '{doctor_id}';
    """)
    if rows:
        print(f"  기존 매핑된 profile(s):")
        for r in rows:
            print(f"    @{r['handle']} ({r['display_name']})")
    else:
        print(f"  기존 매핑: (없음)")

    # 실행
    sql = f"""
do $$
begin
  -- profile role 을 doctor 로 (이미 doctor 면 noop)
  update public.profiles set role = 'doctor'::user_role where id = '{profile_id}';

  -- doctor_accounts 매핑 추가 (중복 시 무시)
  insert into public.doctor_accounts (doctor_id, profile_id)
  values ('{doctor_id}', '{profile_id}')
  on conflict do nothing;
end $$;
select 'OK' as status;
"""
    result = run(sql)
    print(f"  실행 결과: {result}")

    # 검증
    rows = run(f"""
      select da.profile_id, p.handle, p.display_name, p.role
      from doctor_accounts da
      join profiles p on p.id = da.profile_id
      where da.doctor_id = '{doctor_id}' and da.profile_id = '{profile_id}';
    """)
    if rows:
        r = rows[0]
        print(f"  ✅ 매핑 확인: @{r['handle']} ({r['display_name']}) role={r['role']}")
    else:
        print(f"  ❌ 매핑 검증 실패")
