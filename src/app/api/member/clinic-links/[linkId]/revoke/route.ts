import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError, parseLinkId } from "@/lib/clinic-link-rpc";

export const dynamic = "force-dynamic";

/**
 * POST /api/member/clinic-links/{linkId}/revoke — 회원: 연결 해제(active → revoked).
 *
 * member_revoke_clinic_link RPC(0345) 위임 — 본인 수신 active 링크만.
 * active 가 아니면 link_not_active → 409. 해제 후 병원은 해당 회원에게
 * 시술노트 대행 작성 불가(clinic_add_visit 이 active 필수 검증).
 * 기존 작성분 시술노트는 회원 소유라 그대로 유지.
 *
 * 가드: 로그인(active 명함)만 — 본인 수신 링크 검증은 RPC 내부(auth.uid() + profile_id 대조).
 * CSRF Origin 검증은 middleware.ts 가 모든 unsafe-method /api/* 요청에 적용(라우트 무중복).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ linkId: string }> },
) {
  const { linkId: rawLinkId } = await ctx.params;
  const linkId = parseLinkId(rawLinkId);
  if (linkId === null) {
    return errorResponse(null, "invalid_input", "[member/clinic-links revoke POST] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[member/clinic-links revoke POST] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "member-clinic-revoke",
    userId: idCtx.user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const { error: rpcErr } = await supabase.rpc("member_revoke_clinic_link", {
    p_profile_id: idCtx.active.profileId,
    p_link_id: linkId,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[member/clinic-links revoke POST]",
    );
  }

  return NextResponse.json({ ok: true });
}
