import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  IDENTITY_COOKIE,
  IDENTITY_MIRROR_COOKIE,
  bundleProfileFilter,
} from "@/lib/identity-shared";
import { normalizeLegacyIdentityValue } from "@/lib/identity-server";
import { logAudit } from "@/lib/audit-log";
import { errorResponse } from "@/lib/error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 9: ID 스위치 — 모든 ID = profiles row.
 *
 * POST { identityId: <profile UUID> }
 *
 * cookie 'pibutenten:identity'에 target profile.id 저장 (항상 UUID).
 * 본인 묶음(auth_user_id) 안의 profile 인지 검증.
 *
 * Critical-5 (2026-05-27) — sentinel "primary" 멸종:
 *   옛 클라이언트가 보내던 "primary" 문자열은 호환성을 위해 수용하고 즉시 user.id (base
 *   profile.id UUID) 로 정규화한 뒤 cookie 에는 UUID 만 저장. 새 클라이언트는 UUID 만 전송.
 */
export async function POST(req: Request) {
  let body: { identityId?: string } = {};
  try {
    body = (await req.json()) as { identityId?: string };
  } catch (e) {
    return errorResponse(e, "invalid_input", "[identity/switch] body parse", 400, undefined, {
      userMessage: "잘못된 요청",
    });
  }
  const targetRaw = (body.identityId ?? "").trim();
  if (!targetRaw) {
    return errorResponse(null, "invalid_input", "[identity/switch] identityId missing", 400, undefined, {
      userMessage: "identityId 필요",
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(null, "unauthorized", "[identity/switch] auth required", 401);
  }

  // 2026-05-28: 옛 sentinel "primary" 정규화 + UUID 검증을 normalizeLegacyIdentityValue
  // SSOT 헬퍼로 위임 (identity-server.ts). 같은 호환성 규칙이 cookie/payload 진입점에서
  // 일관 적용된다. invalid (빈 값 / 비-UUID / 정규화 후에도 비-UUID) 면 null.
  const target = normalizeLegacyIdentityValue(targetRaw, user.id);
  if (!target) {
    return errorResponse(null, "invalid_input", "[identity/switch] invalid uuid", 400, undefined, {
      userMessage: "잘못된 identityId 형식",
    });
  }
  // 본인 묶음 (auth_user_id) 안의 profile 인지 검증 (본 계정 = user.id 도 자동 포함)
  const { data: row } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", target)
    .or(bundleProfileFilter(user.id))
    .maybeSingle();
  if (!row) {
    return errorResponse(null, "forbidden", "[identity/switch] not in bundle", 403, undefined, {
      userMessage: "권한 없음 — 본인 ID가 아닙니다.",
    });
  }

  // 보안 패턴 (2026-05-16): 쿠키 2개 분리.
  //   1) pibutenten:identity         — httpOnly. 서버가 신뢰하는 단일 진실. (XSS 탈취 불가)
  //   2) pibutenten:identity-mirror  — httpOnly X. UI 표시 전용. 탈취돼도 위장 불가 (서버가 무시).
  // 두 값을 항상 동일하게 set. server side getIdentityContext 는 (1)만 읽는다.
  const cookieStore = await cookies();
  const baseOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  cookieStore.set(IDENTITY_COOKIE, target, {
    ...baseOpts,
    httpOnly: true, // 보안: JS 접근 차단 (XSS 방어)
  });
  cookieStore.set(IDENTITY_MIRROR_COOKIE, target, {
    ...baseOpts,
    httpOnly: false, // 클라이언트 표시용 — 서버는 신뢰 X
  });

  // 보안 2.5차 F묶음 — 감사 로그 기록.
  await logAudit({
    action: "identity.switch",
    actorAuthUserId: user.id,
    targetTable: "profiles",
    targetId: target,
    request: req,
  });

  return NextResponse.json({ ok: true, identityId: target });
}
