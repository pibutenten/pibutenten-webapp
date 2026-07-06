import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";

export const dynamic = "force-dynamic";

/**
 * GET /api/member/clinic-links — 회원: 연결 병원 관리 목록.
 *
 * member_list_clinic_links RPC(0345) 위임 — 본인(active 명함) 수신 연결 전체
 * (pending/active/rejected/revoked). clinic_member_links 는 직접 GRANT 없음(0344)
 * → 본 RPC 가 연결관리 화면의 유일한 데이터 경로.
 *
 * 가드: 로그인(active 명함)만 — 명함 소유 재검증은 RPC 내부(auth.uid() 대조).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[member/clinic-links GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }

  const { data, error: rpcErr } = await supabase.rpc("member_list_clinic_links", {
    p_profile_id: idCtx.active.profileId,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[member/clinic-links GET]",
      "generic",
    );
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
