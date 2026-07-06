import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { mapClinicLinkRpcError, parseLinkId } from "@/lib/clinic-link-rpc";
import { MemberLinkRespondSchema } from "@/lib/schema/api/clinic";

export const dynamic = "force-dynamic";

/**
 * POST /api/member/clinic-links/{linkId}/respond — 회원: 연결 동의/거절.
 *
 * member_respond_link RPC(0345) 위임 — pending 링크만. 동의 시 회원 정보 1회 스냅샷
 * 복사(status=active, consent_version 은 서버 상수) + (선택) backfill_legal_name=true 면
 * 병원 입력 실명을 내 프로필 legal_name 에 저장(비어있을 때만 — RPC 내부 가드).
 * 거절 시 status=rejected. 이미 처리된 링크는 link_not_pending → 409.
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
    return errorResponse(null, "invalid_input", "[member/clinic-links respond POST] bad id", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[member/clinic-links respond POST] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다.",
    });
  }

  const limited = await rateLimit({
    request: req,
    bucketPrefix: "member-clinic-respond",
    userId: idCtx.user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[member/clinic-links respond POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = MemberLinkRespondSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[member/clinic-links respond POST] zod", 400, undefined, {
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

  const { error: rpcErr } = await supabase.rpc("member_respond_link", {
    p_profile_id: idCtx.active.profileId,
    p_link_id: linkId,
    p_consent: p.consent,
    p_backfill_legal_name: p.backfill_legal_name ?? false,
  });
  if (rpcErr) {
    return mapClinicLinkRpcError(
      rpcErr as { code?: string; message?: string },
      "[member/clinic-links respond POST]",
    );
  }

  return NextResponse.json({ ok: true });
}
