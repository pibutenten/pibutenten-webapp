import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinic/patients?q= — 병원: 환자(연결) 목록/검색.
 *
 * get_clinic_patients RPC(0345) 위임 — 자기 지점 연결만, 환자명·차트번호·핸들 ILIKE 검색
 * (와일드카드 이스케이프는 RPC 내부). requested_*(감사값)는 RPC 가 반환하지 않음(§5.4).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(인라인 검사 — API_POLICY 관례).
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/patients GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/patients GET] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const url = new URL(req.url);
  // 검색어 — 공백 trim 후 빈 문자열이면 전체 목록(null). 과대 입력 방어로 100자 절단.
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  const { data, error: rpcErr } = await supabase.rpc("get_clinic_patients", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_search: q === "" ? null : q,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/patients GET]",
      "generic",
    );
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
