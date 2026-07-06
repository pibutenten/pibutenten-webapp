import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError } from "@/lib/clinic-link-rpc";
import { ClinicLinkRequestSchema } from "@/lib/schema/api/clinic";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/clinic/links — 병원: 회원 등록(연결) 요청.
 *
 * clinic_request_link RPC(0345) 위임 — handle+생년월일 하드키 대조 후 pending 연결 생성
 * + 회원에게 동의 요청 알림. 회원 없음/생일 불일치는 동일 에러(match_failed)로 반환
 * (열거 공격 방지 — 응답 문구도 사유를 구분하지 않음).
 *
 * 가드: active 명함 role=clinic + clinic_id 보유(인라인 검사 — API_POLICY 관례).
 * RPC 내부에서 명함 소유(auth.uid())·지점 단위 rate limit(분당 10회)을 재검증.
 *
 * CSRF Origin 검증은 middleware.ts 가 모든 unsafe-method /api/* 요청에 적용(라우트 무중복).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[clinic/links POST] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }
  if (idCtx.active.role !== ROLES.CLINIC || idCtx.active.clinicId == null) {
    return errorResponse(null, "forbidden", "[clinic/links POST] clinic role required", 403, undefined, {
      userMessage: "병원 계정만 사용할 수 있어요.",
    });
  }

  // rate limit — 라우트(사용자 단위) + RPC(지점 단위) 이중 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "clinic-links-post",
    userId: idCtx.user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[clinic/links POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = ClinicLinkRequestSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[clinic/links POST] zod", 400, undefined, {
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

  const { data: rpcData, error: rpcErr } = await supabase.rpc("clinic_request_link", {
    p_clinic_profile_id: idCtx.active.profileId,
    p_handle: p.handle,
    p_legal_name: p.legal_name,
    p_birthdate: p.birthdate,
    p_registration_number: p.registration_number ?? null,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(rpcErr as { code?: string; message?: string }, "[clinic/links POST]");
  }

  return NextResponse.json({ link_id: Number(rpcData) }, { status: 201 });
}
