#!/usr/bin/env python3
"""
원장 프로필 SNS URL 일괄 갱신.

Supabase Management API (PAT)로 SQL 직접 실행.
.env.local 의 SUPABASE_ACCESS_TOKEN · SUPABASE_PROJECT_REF 사용.

사용:
  python scripts/update_doctor_sns.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path


def load_env(env_path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


# 공통 YouTube — 9명 모두 동일 채널로 노출.
COMMON_YOUTUBE = "https://www.youtube.com/@pibutenten"

# slug → 소속 병원 홈페이지 (clinic.ts CLINICS 매핑과 동일).
DOCTOR_CLINIC_URL: dict[str, str] = {
    "jung-hanmi": "https://healhousegn.com/",
    "bae-jungmin": "https://healhousegn.com/",
    "kwon-soohyun": "https://healhousesw.com/",
    "ko-hyerim": "https://healhousesw.com/",
    "kim-soohyung": "https://healhousesw.com/",
    "kim-jongsic": "https://www.healhousepg.com/",
    "rhee-doyoung": "https://healhousegd.com/",
    "kang-hyunjin": "https://healhousegd.com/",
    "park-hyojin": "https://healhousedg.com/",
}

# 원장 본인 SNS (사용자가 제공한 분만). 추후 추가될 수 있음.
DOCTOR_PERSONAL_SNS: dict[str, dict[str, str]] = {
    "jung-hanmi": {
        "instagram": "https://www.instagram.com/healhouseskin_gangnam",
        "threads": "https://www.threads.com/@jhanmi__",
    },
    "rhee-doyoung": {
        "instagram": "https://www.instagram.com/dr.rhee50/",
        "threads": "https://www.threads.com/@dr.rhee50",
    },
    "kim-jongsic": {
        "instagram": "https://www.instagram.com/healhouseskin_pangyo",
        "blog": "https://blog.naver.com/healhousepg",
    },
}


def build_sns_by_slug() -> dict[str, dict[str, str]]:
    """모든 9명에게 clinicUrl·youtube 공통 적용 + 개인 SNS merge."""
    out: dict[str, dict[str, str]] = {}
    for slug, clinic_url in DOCTOR_CLINIC_URL.items():
        entry = {"clinicUrl": clinic_url, "youtube": COMMON_YOUTUBE}
        entry.update(DOCTOR_PERSONAL_SNS.get(slug, {}))
        out[slug] = entry
    return out


SNS_BY_SLUG: dict[str, dict[str, str]] = build_sns_by_slug()


def run_sql(token: str, project_ref: str, sql: str) -> list[dict]:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "pibutenten-cli/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    env = load_env(here / ".env.local")
    token = env.get("SUPABASE_ACCESS_TOKEN")
    ref = env.get("SUPABASE_PROJECT_REF")
    if not token or not ref:
        print("missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env.local", file=sys.stderr)
        return 1

    for slug, sns in SNS_BY_SLUG.items():
        sns_json = json.dumps(sns).replace("'", "''")
        sql = (
            "update public.doctors "
            f"set profile_data = coalesce(profile_data, '{{}}'::jsonb) || '{sns_json}'::jsonb "
            f"where slug = '{slug}' "
            "returning slug, profile_data;"
        )
        try:
            result = run_sql(token, ref, sql)
        except urllib.error.HTTPError as e:
            print(f"[{slug}] HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
            return 1
        if not result:
            print(f"[{slug}] no row updated (slug not found?)", file=sys.stderr)
            continue
        print(f"[ok] {slug}:", json.dumps(result[0]["profile_data"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
