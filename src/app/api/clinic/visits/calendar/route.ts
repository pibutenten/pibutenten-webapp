import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinic/visits/calendar — 병원: 월간 캘린더 날짜별 기록 수(S4 · 계획 §4.2 치명4).
 *
 * get_clinic_calendar_summary RPC(0350) 위임 — source='clinic' AND clinic_id=자기(RPC 내부).
 *   쿼리 파라미터:
 *     year  — 연도(2000~2100 정수 재검).
 *     month — 월(1~12 정수 재검).
 *   응답 `{ days: [{ visit_date, visit_count }] }` — 그 달에 기록이 있는 날만(GROUP BY visited_on).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(visits POST/GET 과 동일 인라인 검사).
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(
      null,
      "unauthorized",
      "[clinic/visits/calendar GET] auth required",
      401,
      undefined,
      { userMessage: "로그인이 필요합니다." },
    );
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(
      null,
      "forbidden",
      "[clinic/visits/calendar GET] clinic role required",
      403,
      undefined,
      { userMessage: "병원 계정만 사용할 수 있어요." },
    );
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const year = parseInt(sp.get("year") ?? "", 10);
  const month = parseInt(sp.get("month") ?? "", 10);
  if (Number.isNaN(year) || year < 2000 || year > 2100) {
    return errorResponse(
      null,
      "invalid_input",
      "[clinic/visits/calendar GET] year range",
      400,
      undefined,
      { userMessage: "연도가 올바르지 않습니다." },
    );
  }
  if (Number.isNaN(month) || month < 1 || month > 12) {
    return errorResponse(
      null,
      "invalid_input",
      "[clinic/visits/calendar GET] month range",
      400,
      undefined,
      { userMessage: "월이 올바르지 않습니다." },
    );
  }

  const { data, error: rpcErr } = await supabase.rpc("get_clinic_calendar_summary", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_year: year,
    p_month: month,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/visits/calendar GET]",
      "generic",
    );
  }

  return NextResponse.json(
    { days: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
