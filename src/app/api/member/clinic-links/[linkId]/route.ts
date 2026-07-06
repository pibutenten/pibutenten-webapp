import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError, parseLinkId } from "@/lib/clinic-link-rpc";

export const dynamic = "force-dynamic";

/**
 * GET /api/member/clinic-links/{linkId} — 회원: 연결 1건 조회(동의 화면용 §8.3).
 *
 * member_get_clinic_link RPC(0345) 위임 — 본인 수신 링크만. 병원 표시명 + 병원 입력
 * 실명(requested_legal_name — 회원 본인 확인용 §4.1) 포함. 타인 링크·미존재는 빈 결과 → 404.
 *
 * 가드: 로그인(active 명함)만 — 명함 소유 재검증은 RPC 내부(auth.uid() 대조).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ linkId: string }> },
) {
  const { linkId: rawLinkId } = await ctx.params;
  const linkId = parseLinkId(rawLinkId);
  if (linkId === null) {
    return errorResponse(null, "invalid_input", "[member/clinic-links/:linkId GET] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[member/clinic-links/:linkId GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }

  const { data, error: rpcErr } = await supabase.rpc("member_get_clinic_link", {
    p_profile_id: idCtx.active.profileId,
    p_link_id: linkId,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[member/clinic-links/:linkId GET]",
      "generic",
    );
  }

  // RETURNS TABLE — 빈 배열이면 미존재(타인 링크 포함, 비구분) → 404.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return errorResponse(null, "not_found", "[member/clinic-links/:linkId GET] not found", 404, undefined, {
      userMessage: "연결을 찾을 수 없어요.",
    });
  }

  return NextResponse.json(row, { headers: { "cache-control": "no-store" } });
}
