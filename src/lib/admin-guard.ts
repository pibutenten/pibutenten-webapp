/**
 * admin-guard
 *
 * Phase 9 모델: 한 사용자(auth.users.id)가 여러 `profiles` row를 가질 수 있고
 * 같은 사용자임은 `auth_user_id` 컬럼으로 묶임. 따라서 admin 권한 검사는
 * 묶음(auth_user_id) 안에 role='admin' profile이 존재하면 통과로 본다.
 *
 * 사용 예:
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard.response;
 *   // 통과: guard.userId / guard.adminProfileId 사용 가능
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";
import { bundleProfileFilter } from "./identity-shared";

export type AdminGuardResult =
  | {
      ok: true;
      userId: string;
      adminProfileId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * admin 권한 검사 — 묶음(auth_user_id) 기준.
 * 통과 조건: 같은 auth_user_id 그룹 안에 role='admin' profile이 1개 이상 존재.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  return requireAnyOfRoles(["admin"]);
}

/**
 * admin 또는 doctor 권한 검사 — 묶음 기준.
 * 카드 편집·참고문헌 추가 등 원장도 접근 가능한 API용.
 */
export async function requireAdminOrDoctor(): Promise<AdminGuardResult> {
  return requireAnyOfRoles(["admin", "doctor"]);
}

async function requireAnyOfRoles(
  roles: Array<"admin" | "doctor" | "user">,
): Promise<AdminGuardResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  // 같은 auth_user_id 묶음 안에서 허용 role profile 검색
  // (legacy: profiles.id 가 user.id 와 동일한 경우도 함께 매칭)
  const { data: rows } = await supabase
    .from("profiles")
    .select("id, role")
    .or(bundleProfileFilter(user.id))
    .in("role", roles);

  const match = (rows ?? []).find((r) =>
    roles.includes(r.role as "admin" | "doctor" | "user"),
  );
  if (!match) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: ${roles.join(" or ")} only` },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true,
    userId: user.id,
    adminProfileId: match.id as string,
  };
}
