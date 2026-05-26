/**
 * admin-guard
 *
 * ADR 0012 정합 (2026-05-26): 명함(profile) 단위 완전 독립 원칙.
 * 권한 판정 = **현재 active profile** 기준. 묶음 OR 합산 폐기.
 *
 * 사용 예:
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard.response;
 *   // 통과: guard.userId / guard.activeProfileId 사용 가능
 *
 * 묶음 안에 admin profile 이 있어도, 현재 active 가 admin 명함이 아니면 차단.
 * 사용자 결정 (2026-05-26): "관리자 명함이 아니면 그냥 못 들어가는 게 맞음. 안내 불필요."
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";
import { getIdentityContext } from "./identity";

export type AdminGuardResult =
  | {
      ok: true;
      userId: string;
      /** 현재 active profile.id (ADR 0012 — 명함 단위 권한) */
      activeProfileId: string;
      /** @deprecated 호환성 — activeProfileId 와 동일. 새 코드는 activeProfileId 사용. */
      adminProfileId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Super admin 권한 검사 — active 명함이 admin role 이어야 통과.
 * ADR 0012 정합: 묶음 OR 폐기.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!idCtx.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: admin only" },
        { status: 403 },
      ),
    };
  }
  const activeProfileId = idCtx.active?.profileId ?? idCtx.user.id;
  return {
    ok: true,
    userId: idCtx.user.id,
    activeProfileId,
    adminProfileId: activeProfileId,
  };
}

/**
 * Admin 또는 doctor 권한 검사 — active 명함 기준.
 * 카드 편집·참고문헌 추가 등 원장도 접근 가능한 API용.
 */
export async function requireAdminOrDoctor(): Promise<AdminGuardResult> {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: admin or doctor only" },
        { status: 403 },
      ),
    };
  }
  const activeProfileId = idCtx.active?.profileId ?? idCtx.user.id;
  return {
    ok: true,
    userId: idCtx.user.id,
    activeProfileId,
    adminProfileId: activeProfileId,
  };
}

/**
 * @deprecated requireAdmin() 으로 통합됨 (ADR 0012). 본 함수는 호환 wrapper.
 */
export const requireActiveSuperAdmin = requireAdmin;

/**
 * @deprecated requireAdminOrDoctor() 로 통합됨 (ADR 0012). 본 함수는 호환 wrapper.
 */
export const requireActiveSuperOrDoctorAdmin = requireAdminOrDoctor;

/** @deprecated 호환 — requireAdmin 결과 타입과 동일. */
export type ActiveAdminGuardResult = AdminGuardResult;
