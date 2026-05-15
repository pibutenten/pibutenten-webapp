#!/usr/bin/env python3
"""직전 잘못된 매핑 되돌리기 + 올바른 묶음(auth_user_id) 형성.

직전 swap_doctor_mappings.py 가 한 잘못된 일:
  - 사과/너구리/Hyerim/뚜엉이 role: user → doctor (잘못)
  - doctor_accounts 매핑 교체: placeholder doctor profile → 회원 명함 (잘못)

사용자의 진짜 의도:
  - 사과/너구리/Hyerim/뚜엉이는 user role 그대로 유지
  - 회원 명함을 placeholder doctor profile 묶음에 추가
  - 묶음 = 같은 auth_user_id 그룹 (PRD §C 패턴)
  - 배정민 묶음 (배정민 doctor + 개발자 admin + 배스킨 user) 과 동일 구조

올바른 작업:
  1. doctor_accounts 매핑 원복:
     김종식 ← @kim-jongsic, 정한미 ← @jung-hanmi,
     고혜림 ← @ko-hyerim, 권수현 ← @kwon-soohyun
  2. 회원 명함 role 되돌리기: doctor → user
     @hhskin02 (사과), @u-x3x6fb (너구리), @drizzle212 (Hyerim), @pinkegg119 (뚜엉이)
  3. 묶음 형성 — placeholder doctor profile 의 auth_user_id = 회원 명함의 id (또는 그 회원의 auth_user_id):
     @kim-jongsic.auth_user_id = @hhskin02 의 auth_user_id (또는 id)
     @jung-hanmi.auth_user_id  = @u-x3x6fb 의 auth_user_id
     @ko-hyerim.auth_user_id   = @drizzle212 의 auth_user_id
     @kwon-soohyun.auth_user_id = @pinkegg119 의 auth_user_id

배정민 묶음 패턴 참고 (예시):
  - 배정민 (doctor) auth_user_id = X (본인이 OAuth 가입한 auth user id)
  - 개발자 (admin)  auth_user_id = X (같은 묶음)
  - 배스킨 (user)   auth_user_id = X (같은 묶음)
  → 모두 같은 auth_user_id 공유 = 한 사람의 명함 묶음.

회원 명함 (사과 등) 은 OAuth 가입한 사람의 본인 profile.
그 회원의 auth_user_id (또는 id, 같음) 를 묶음의 anchor 로 사용.
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

# (doctor_slug 의 placeholder profile handle, 회원 명함 식별 (handle 또는 display_name), label)
PAIRS = [
    ('kim-jongsic',  ('handle', 'hhskin02'),   '김종식 ↔ 사과'),
    ('jung-hanmi',   ('handle', 'u-x3x6fb'),   '정한미 ↔ 너구리'),
    ('ko-hyerim',    ('handle', 'drizzle212'), '고혜림 ↔ Hyerim'),
    ('kwon-soohyun', ('name',   '뚜엉이'),       '권수현 ↔ 뚜엉이'),
]

print("===== STEP 1: doctor_accounts 매핑 원복 (placeholder doctor profile 로) =====\n")
for slug, _, label in PAIRS:
    print(f"--- {label} ---")
    # placeholder profile (handle = slug)
    rows = run(f"select id from profiles where handle = '{slug}';")
    if not rows:
        print(f"  ❌ placeholder profile not found: handle={slug}")
        continue
    placeholder_pid = rows[0]['id']
    rows = run(f"select id from doctors where slug = '{slug}';")
    if not rows:
        print(f"  ❌ doctor not found: {slug}")
        continue
    doctor_id = rows[0]['id']

    # 현재 매핑 확인
    rows = run(f"""
      select da.profile_id, p.handle, p.display_name
      from doctor_accounts da join profiles p on p.id = da.profile_id
      where da.doctor_id = '{doctor_id}';
    """)
    if rows and rows[0]['profile_id'] == placeholder_pid:
        print(f"  이미 placeholder ({slug}) 매핑됨 — 건너뜀")
        continue
    if rows:
        print(f"  현재 매핑: @{rows[0]['handle']} ({rows[0]['display_name']}) — placeholder 로 되돌림")

    sql = f"""
do $$ begin
  delete from public.doctor_accounts where doctor_id = '{doctor_id}';
  insert into public.doctor_accounts (doctor_id, profile_id)
  values ('{doctor_id}', '{placeholder_pid}');
end $$;
select 'OK' as status;
"""
    try:
        run(sql)
        rows = run(f"""
          select p.handle from doctor_accounts da join profiles p on p.id = da.profile_id
          where da.doctor_id = '{doctor_id}';
        """)
        ok = rows and rows[0]['handle'] == slug
        print(f"  {'✅' if ok else '❌'} 복원 후 매핑: @{rows[0]['handle'] if rows else '(없음)'}")
    except Exception as e:
        print(f"  ❌ 실행 오류: {e}")

print("\n===== STEP 2: 회원 명함 role 되돌리기 (doctor → user) =====\n")
for slug, (key, val), label in PAIRS:
    print(f"--- {label} ---")
    where = f"handle = '{val}'" if key == 'handle' else f"display_name = '{val}'"
    rows = run(f"select id, handle, display_name, role from profiles where {where};")
    if not rows:
        print(f"  ❌ 회원 명함 not found: {key}={val}")
        continue
    if len(rows) > 1:
        print(f"  ⚠️ multiple ({len(rows)}) — skip")
        continue
    p = rows[0]
    if p['role'] == 'user':
        print(f"  @{p['handle']} 이미 role=user — 건너뜀")
        continue
    run(f"update public.profiles set role = 'user'::user_role where id = '{p['id']}';")
    rows = run(f"select role from profiles where id = '{p['id']}';")
    print(f"  @{p['handle']} role: {p['role']} → {rows[0]['role']}")

print("\n===== STEP 3: 묶음(auth_user_id) 형성 =====\n")
print("- placeholder doctor profile 의 auth_user_id 를 회원 명함의 auth_user_id 와 일치시킴")
print("- 회원 명함의 auth_user_id 가 NULL 이면 회원 명함의 id 를 anchor 로 사용\n")
for slug, (key, val), label in PAIRS:
    print(f"--- {label} ---")
    where = f"handle = '{val}'" if key == 'handle' else f"display_name = '{val}'"
    rows = run(f"select id, handle, auth_user_id from profiles where {where};")
    if not rows:
        print(f"  ❌ 회원 명함 not found")
        continue
    member = rows[0]
    member_id = member['id']
    member_aui = member['auth_user_id']
    # anchor = 회원 명함의 auth_user_id, 없으면 회원 자체 id
    anchor = member_aui if member_aui else member_id
    print(f"  회원 @{member['handle']} id={member_id[:8]}... auth_user_id={member_aui or '(NULL→자기 id 사용)'}")

    # placeholder doctor profile 의 auth_user_id 갱신
    rows = run(f"select id, handle, auth_user_id from profiles where handle = '{slug}';")
    if not rows:
        print(f"  ❌ placeholder not found")
        continue
    placeholder = rows[0]
    print(f"  placeholder @{placeholder['handle']} 현재 auth_user_id={placeholder['auth_user_id'] or '(NULL)'}")

    # 추가: 회원 명함의 auth_user_id 가 NULL 이면 본인 id 로 채움 (anchor 통일)
    if not member_aui:
        run(f"update public.profiles set auth_user_id = '{member_id}' where id = '{member_id}';")
        print(f"  ✓ 회원 명함 auth_user_id <- 자기 id ({member_id[:8]}...)")

    # placeholder.auth_user_id = anchor
    run(f"update public.profiles set auth_user_id = '{anchor}' where id = '{placeholder['id']}';")
    rows = run(f"select auth_user_id from profiles where id = '{placeholder['id']}';")
    print(f"  ✅ placeholder auth_user_id = {rows[0]['auth_user_id'][:8]}... (anchor)")

print("\n===== 최종 묶음 확인 =====\n")
for slug, (key, val), label in PAIRS:
    where = f"handle = '{val}'" if key == 'handle' else f"display_name = '{val}'"
    rows = run(f"""
      select p.handle, p.display_name, p.role, p.auth_user_id
      from profiles p
      where p.auth_user_id = (
        select id from profiles where {where}
      ) or p.id = (select id from profiles where {where})
      order by p.role;
    """)
    print(f"--- {label} 묶음 ({len(rows)} profiles) ---")
    for r in rows:
        print(f"  @{r['handle']:20s} {r['display_name']:10s} role={r['role']}")
