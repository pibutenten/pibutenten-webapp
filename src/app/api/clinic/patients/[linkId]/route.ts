import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError, parseLinkId } from "@/lib/clinic-link-rpc";
import { ClinicPatientUpdateSchema } from "@/lib/schema/api/clinic";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/clinic/patients/{linkId} — 병원: 환자 상세 1건.
 *
 * get_clinic_patient RPC(0345) 위임 — 자기 지점 연결만. 미존재·타 지점이면 빈 결과 → 404.
 * 가드: active 명함 role=clinic + clinic_id 보유(인라인 검사 — API_POLICY 관례).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ linkId: string }> },
) {
  const { linkId: rawLinkId } = await ctx.params;
  const linkId = parseLinkId(rawLinkId);
  if (linkId === null) {
    return errorResponse(null, "invalid_input", "[clinic/patients/:linkId GET] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/patients/:linkId GET] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/patients/:linkId GET] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const { data, error: rpcErr } = await supabase.rpc("get_clinic_patient", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_link_id: linkId,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/patients/:linkId GET]",
      "generic",
    );
  }

  // RETURNS TABLE — 빈 배열이면 미존재(자기 지점 아님 포함, 비구분) → 404.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return errorResponse(null, "not_found", "[clinic/patients/:linkId GET] not found", 404, undefined, {
      userMessage: "연결을 찾을 수 없어요.",
    });
  }

  return NextResponse.json(row, { headers: { "cache-control": "no-store" } });
}

/**
 * PATCH /api/clinic/patients/{linkId} — 병원: 환자 기록 수정.
 *
 * clinic_update_patient RPC(0345) 위임.
 *
 * ⚠️ **전체 교체 방식**: RPC 가 모든 patient_*·registration_number 컬럼을 받은 값으로
 *   SET 하므로, 생략·null 필드는 DB 에서 NULL 로 지워진다. 클라이언트 폼은 항상
 *   **전체 폼 값**을 전송해야 함(부분 PATCH 아님 — visits PATCH §3.4 전체 덮어쓰기와 동일 계약).
 *   requested_*(감사값)는 RPC 가 불변 유지.
 *
 * CSRF Origin 검증은 middleware.ts 가 unsafe-method /api/* 에 적용(라우트 무중복).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ linkId: string }> },
) {
  const { linkId: rawLinkId } = await ctx.params;
  const linkId = parseLinkId(rawLinkId);
  if (linkId === null) {
    return errorResponse(null, "invalid_input", "[clinic/patients/:linkId PATCH] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/patients/:linkId PATCH] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/patients/:linkId PATCH] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "clinic-patients-patch",
    userId: idCtx.user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[clinic/patients/:linkId PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = ClinicPatientUpdateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[clinic/patients/:linkId PATCH] zod", 400, undefined, {
      userMessage: "입력 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const p = parsed.data;

  const { error: rpcErr } = await supabase.rpc("clinic_update_patient", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_link_id: linkId,
    p_registration_number: p.registration_number ?? null,
    p_patient_phone: p.patient_phone ?? null,
    p_patient_address: p.patient_address ?? null,
    p_patient_name: p.patient_name ?? null,
    p_patient_birthdate: p.patient_birthdate ?? null,
    p_patient_email: p.patient_email ?? null,
    p_patient_skin_profile: p.patient_skin_profile ?? null,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[clinic/patients/:linkId PATCH]",
    );
  }

  return NextResponse.json({ ok: true });
}
