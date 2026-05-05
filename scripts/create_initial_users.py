#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
관리자 2명 + 원장 9명 계정 일괄 생성.
- Supabase Auth Admin API 사용 (service_role key)
- 생성 후 profiles.role 부여 + doctor_accounts 매핑
- 임시 비번: pibutenten2026!
"""
import json
import os
import urllib.request
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
TEMP_PASSWORD = "pibutenten2026!"

# .env.local에서 service_role key 읽기
env_path = Path(__file__).parent.parent / ".env.local"
SERVICE_ROLE_KEY = None
ACCESS_TOKEN = None
for line in env_path.read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE_ROLE_KEY = line.split("=", 1)[1].strip()
    elif line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

if not SERVICE_ROLE_KEY:
    raise SystemExit("SUPABASE_SERVICE_ROLE_KEY 없음")

ADMINS = [
    ("pibutenten@gmail.com", "피부텐텐 운영"),
    ("jminbae@gmail.com",   "개발자"),
]

DOCTORS = [
    ("dr-jeonghanmi@pibutenten.local",  "정한미", "jeonghanmi"),
    ("dr-baejungmin@pibutenten.local",  "배정민", "baejungmin"),
    ("dr-kwonsuhyun@pibutenten.local",  "권수현", "kwonsuhyun"),
    ("dr-kimsoohyung@pibutenten.local", "김수형", "kimsoohyung"),
    ("dr-gohyerim@pibutenten.local",    "고혜림", "gohyerim"),
    ("dr-kimjongsik@pibutenten.local",  "김종식", "kimjongsik"),
    ("dr-leedoyoung@pibutenten.local",  "이도영", "leedoyoung"),
    ("dr-kanghyunjin@pibutenten.local", "강현진", "kanghyunjin"),
    ("dr-parkhyojin@pibutenten.local",  "박효진", "parkhyojin"),
]


def admin_create_user(email: str, display_name: str) -> str | None:
    """Auth Admin API로 사용자 생성. 이미 있으면 None 반환."""
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    body = {
        "email": email,
        "password": TEMP_PASSWORD,
        "email_confirm": True,
        "user_metadata": {"display_name": display_name},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
            return data.get("id")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        if "already" in body.lower() or e.code == 422:
            print(f"  - 이미 존재: {email}")
            return None
        print(f"  ! 실행 실패 {email}: {e.code} {body[:200]}")
        return None


def mgmt_query(sql: str) -> list:
    """Management API로 SQL 실행."""
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def main():
    print("== 관리자 2명 생성 ==")
    for email, name in ADMINS:
        uid = admin_create_user(email, name)
        if uid:
            print(f"  + 생성: {email} ({uid[:8]}...)")

    print("\n== 원장 9명 생성 ==")
    for email, name, _slug in DOCTORS:
        uid = admin_create_user(email, name)
        if uid:
            print(f"  + 생성: {email} ({uid[:8]}...)")

    print("\n== role 부여 + doctor 매핑 ==")
    # 관리자 role
    admin_emails_sql = ",".join(f"'{e}'" for e, _ in ADMINS)
    sql_admin = f"""
update public.profiles set role = 'admin'
 where id in (select id from auth.users where email in ({admin_emails_sql}));
"""
    mgmt_query(sql_admin.strip())
    print("  + 관리자 role=admin 부여")

    # 원장 role + 매핑
    for email, name, slug in DOCTORS:
        sql_doctor = f"""
update public.profiles set role = 'doctor', display_name = '{name}'
 where id = (select id from auth.users where email = '{email}');

insert into public.doctor_accounts (profile_id, doctor_id)
select u.id, d.id
  from auth.users u
  join public.doctors d on d.slug = '{slug}'
 where u.email = '{email}'
 on conflict (profile_id) do nothing;
"""
        mgmt_query(sql_doctor.strip())
        print(f"  + {name} ({slug}) role=doctor + doctor 매핑")

    # 검증
    print("\n== 검증 ==")
    res = mgmt_query("""
select p.role, count(*) as cnt
  from public.profiles p
 group by p.role
 order by p.role;
""")
    for row in res:
        print(f"  role={row['role']}: {row['cnt']}")

    res2 = mgmt_query("""
select count(*) as cnt from public.doctor_accounts;
""")
    print(f"  doctor_accounts: {res2[0]['cnt']}")


if __name__ == "__main__":
    main()
