#!/usr/bin/env python3
"""doctor_accounts 1:1 매핑 교체:
  김종식 → @hhskin02 (사과)
  정한미 → @u-x3x6fb (너구리)
  고혜림 → @drizzle212 (Hyerim)
+ u-4ta852 잘못된 sub-profile 삭제

doctor_accounts 는 (doctor_id UNIQUE + profile_id PRIMARY KEY) 1:1 구조.
기존 placeholder profile (@kim-jongsic, @jung-hanmi, @ko-hyerim) 의 매핑을
회원 명함으로 교체. placeholder profile 자체는 보존 (role=doctor 그대로).
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

# (doctor_slug, new_profile_handle, label)
SWAPS = [
    ('kim-jongsic',  'hhskin02',   '김종식 ← 사과 (@hhskin02)'),
    ('jung-hanmi',   'u-x3x6fb',   '정한미 ← 너구리 (@u-x3x6fb)'),
    ('ko-hyerim',    'drizzle212', '고혜림 ← Hyerim (@drizzle212)'),
    # 권수현 ← 뚜엉이 — 뚜엉이 handle 미상이라 display_name 으로 찾음 (코드 아래 별도 처리)
]
# display_name 으로 매핑 (handle 모를 때)
SWAPS_BY_NAME = [
    ('kwon-soohyun', '뚜엉이', '권수현 ← 뚜엉이'),
]

for doc_slug, new_handle, label in SWAPS:
    print(f"\n========== {label} ==========")
    # 새 profile 확인
    rows = run(f"select id, handle, display_name, role, auth_user_id from profiles where handle = '{new_handle}';")
    if not rows:
        print(f"  ❌ new profile not found: @{new_handle}")
        continue
    new_p = rows[0]
    new_pid = new_p['id']
    print(f"  새 profile: @{new_p['handle']} ({new_p['display_name']}) role={new_p['role']}")

    # doctor 확인
    rows = run(f"select id, slug, name from doctors where slug = '{doc_slug}';")
    if not rows:
        print(f"  ❌ doctor not found: {doc_slug}")
        continue
    doctor_id = rows[0]['id']
    doctor_name = rows[0]['name']

    # 기존 매핑 조회
    rows = run(f"""
      select da.profile_id, p.handle, p.display_name
      from doctor_accounts da
      join profiles p on p.id = da.profile_id
      where da.doctor_id = '{doctor_id}';
    """)
    if rows:
        old = rows[0]
        print(f"  기존 매핑: @{old['handle']} ({old['display_name']}) — 제거 예정")
    else:
        print(f"  기존 매핑: (없음)")

    # 트랜잭션: 기존 매핑 DELETE + 새 매핑 INSERT
    # profile.role = 'doctor' 로 보장 + 기존 placeholder profile role 은 그대로 두기 (사용자 명시 지시 없음)
    sql = f"""
do $$
begin
  -- 1) 기존 매핑 제거 (doctor_id 단일 UNIQUE 라 1개)
  delete from public.doctor_accounts where doctor_id = '{doctor_id}';

  -- 2) 새 profile role 을 doctor 로 보장
  update public.profiles set role = 'doctor'::user_role where id = '{new_pid}';

  -- 3) 새 매핑 추가
  insert into public.doctor_accounts (doctor_id, profile_id)
  values ('{doctor_id}', '{new_pid}');
end $$;
select 'OK' as status;
"""
    try:
        run(sql)
        # 검증
        rows = run(f"""
          select da.profile_id, p.handle, p.display_name, p.role
          from doctor_accounts da
          join profiles p on p.id = da.profile_id
          where da.doctor_id = '{doctor_id}';
        """)
        if rows and rows[0]['handle'] == new_handle:
            r = rows[0]
            print(f"  ✅ 매핑 완료: {doctor_name} ← @{r['handle']} ({r['display_name']}) role={r['role']}")
        else:
            print(f"  ❌ 매핑 검증 실패: {rows}")
    except Exception as e:
        print(f"  ❌ 실행 오류: {e}")

# display_name 기반 매핑 (뚜엉이)
for doc_slug, display_name, label in SWAPS_BY_NAME:
    print(f"\n========== {label} ==========")
    rows = run(f"select id, handle, display_name, role from profiles where display_name = '{display_name}';")
    if not rows:
        print(f"  ❌ profile not found: display_name='{display_name}'")
        continue
    if len(rows) > 1:
        print(f"  ⚠️ multiple profiles matched ({len(rows)}):")
        for r in rows:
            print(f"    id={r['id'][:8]}... @{r['handle']} name={r['display_name']} role={r['role']}")
        print(f"  → skip (ambiguous)")
        continue
    p = rows[0]
    new_pid = p['id']
    print(f"  새 profile: @{p['handle']} ({p['display_name']}) role={p['role']}")

    rows = run(f"select id, name from doctors where slug = '{doc_slug}';")
    if not rows:
        print(f"  ❌ doctor not found: {doc_slug}")
        continue
    doctor_id = rows[0]['id']
    doctor_name = rows[0]['name']

    rows = run(f"""
      select da.profile_id, p.handle, p.display_name
      from doctor_accounts da
      join profiles p on p.id = da.profile_id
      where da.doctor_id = '{doctor_id}';
    """)
    if rows:
        old = rows[0]
        print(f"  기존 매핑: @{old['handle']} ({old['display_name']}) — 제거")
    else:
        print(f"  기존 매핑: (없음)")

    sql = f"""
do $$
begin
  delete from public.doctor_accounts where doctor_id = '{doctor_id}';
  update public.profiles set role = 'doctor'::user_role where id = '{new_pid}';
  insert into public.doctor_accounts (doctor_id, profile_id)
  values ('{doctor_id}', '{new_pid}');
end $$;
select 'OK' as status;
"""
    try:
        run(sql)
        rows = run(f"""
          select da.profile_id, p.handle, p.display_name, p.role
          from doctor_accounts da
          join profiles p on p.id = da.profile_id
          where da.doctor_id = '{doctor_id}';
        """)
        if rows:
            r = rows[0]
            print(f"  ✅ 매핑 완료: {doctor_name} ← @{r['handle']} ({r['display_name']}) role={r['role']}")
        else:
            print(f"  ❌ 검증 실패")
    except Exception as e:
        print(f"  ❌ 실행 오류: {e}")

# 4) u-4ta852 (잘못 생성된 정한미 sub-profile) 삭제
print(f"\n========== u-4ta852 (잘못된 정한미 sub-profile) 삭제 ==========")
# 활동 데이터 카운트 먼저 확인
rows = run("""
select
  (select count(*) from cards where author_id = (select id from profiles where handle='u-4ta852')) as cards,
  (select count(*) from comments where author_id = (select id from profiles where handle='u-4ta852')) as comments,
  (select count(*) from card_likes where user_id = (select id from profiles where handle='u-4ta852')) as likes,
  (select count(*) from card_saves where user_id = (select id from profiles where handle='u-4ta852')) as saves;
""")
if rows:
    a = rows[0]
    print(f"  활동 데이터: cards={a['cards']} comments={a['comments']} likes={a['likes']} saves={a['saves']}")
    has_data = a['cards'] or a['comments'] or a['likes'] or a['saves']
    if has_data:
        print(f"  ⚠️ 활동 데이터 존재 — cascade 삭제 시 함께 사라짐.")
    # 삭제 실행
    try:
        run("delete from public.profiles where handle = 'u-4ta852';")
        rows = run("select 1 from profiles where handle = 'u-4ta852';")
        if not rows:
            print(f"  ✅ u-4ta852 profile 삭제 완료")
        else:
            print(f"  ❌ 삭제 실패 (여전히 존재)")
    except Exception as e:
        print(f"  ❌ 삭제 오류: {e}")
