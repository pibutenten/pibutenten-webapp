import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { ReviewCreateSchema } from "@/lib/schema/api/reviews";
import { screenContent, maskProhibitedMentions } from "@/lib/content-screening";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

type SubmitStatus = "pending_review" | "published";

/**
 * PATCH /api/reviews/{shortcode} — 시술후기(P3) 수정.
 *
 * POST /api/reviews 의 수정 대응판. 시술명(procedure_ko)·작성자는 잠금(변경 불가),
 * 만족도·통증·재시술·체감효과·제목·본문만 갱신. 권한(작성자/admin)은 RPC 가 검증.
 *
 * 흐름(POST 미러링):
 *   1. active identity 확인 (없으면 401).
 *   2. role=user 온보딩 게이트.
 *   3. rate limit.
 *   4. zod 검증(ReviewCreateSchema 재사용).
 *   5. 마스킹(병원·의사명) + 소프트검수 → status.
 *   6. RPC update_procedure_review (권한·존재 검증은 RPC). card_not_found→404, not_authorized→403.
 *   7. revalidatePath(해당 글·피드·프로필).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await ctx.params;
  if (!shortcode || !/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) {
    return errorResponse(null, "invalid_input", "[reviews PATCH] bad shortcode", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  // 1. active identity.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[reviews PATCH] auth required", 401);
  }
  const user = idCtx.user;
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";

  // 2. 온보딩 게이트 (USER 명함만).
  if (
    role === ROLES.USER &&
    (!idCtx.active.birthdate || !idCtx.active.termsAgreedAt)
  ) {
    return errorResponse(null, "forbidden", "[reviews PATCH] onboarding_required", 403, undefined, {
      userMessage: "프로필 기본 정보를 먼저 입력해주세요.",
    });
  }

  // 3. Rate limit.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "reviews-patch",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 4. zod 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[reviews PATCH] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = ReviewCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[reviews PATCH] zod parse", 400, undefined, {
      userMessage: "요청 형식이 올바르지 않습니다.",
      devOnly: {
        issues: parsed.error.issues.slice(0, 5).map((iss) => ({
          path: iss.path.join("."),
          code: iss.code,
        })),
      },
    });
  }
  const payload = parsed.data;
  const procedureKo = payload.procedure_ko.trim();

  // 5. title 기본값 + 마스킹.
  const rawTitle = (payload.title ?? "").trim() || `${procedureKo} 시술후기`;
  const rawBody = payload.body.trim();
  const maskedTitle = maskProhibitedMentions(rawTitle);
  const maskedBody = maskProhibitedMentions(rawBody);
  const title = maskedTitle.text;
  const body = maskedBody.text;
  const blindedCount = maskedTitle.count + maskedBody.count;

  // 소프트 검수 — role=user 만.
  let status: SubmitStatus = "published";
  let screeningFlagged = false;
  let screeningReasons: string[] = [];
  if (role === ROLES.USER) {
    const verdict = screenContent({
      title,
      body,
      keywords: [procedureKo],
      externalUrl: null,
      authorRole: "user",
    });
    if (verdict.flagged) {
      status = "pending_review";
      screeningFlagged = true;
      screeningReasons = verdict.reasons;
    }
  }

  // 6. RPC — 카드 + procedure_reviews 원자적 갱신. 권한/존재 검증은 RPC 내부.
  //    NOTE: update_procedure_review 는 아직 p_recommend 파라미터가 없으므로 recommend 는
  //      여기서 RPC 로 전달하지 않는다(미전달 = 기존 recommend 값 유지). 스키마는 일관성을 위해
  //      recommend 를 수용(검증)하되, 수정 경로의 recommend 갱신은 RPC 확장이 따르는 별도 안건.
  const { data: rpcData, error: rpcErr } = await supabase.rpc("update_procedure_review", {
    p_shortcode: shortcode,
    p_title: title,
    p_body: body,
    p_keywords: [procedureKo],
    p_status: status,
    p_satisfaction: payload.satisfaction,
    p_pain: payload.pain,
    p_revisit: payload.revisit,
    p_effect_areas: payload.effect_areas,
    p_downtime: payload.downtime,
    p_effect_onset: payload.effect_onset,
  });
  if (rpcErr) {
    const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";
    if (msg.includes("card_not_found")) {
      return errorResponse(rpcErr, "not_found", "[reviews PATCH] card_not_found", 404, undefined, {
        userMessage: "수정할 후기를 찾을 수 없습니다.",
      });
    }
    if (msg.includes("not_authorized")) {
      return errorResponse(rpcErr, "forbidden", "[reviews PATCH] not_authorized", 403, undefined, {
        userMessage: "본인 후기만 수정할 수 있습니다.",
      });
    }
    return errorResponse(rpcErr, "save_failed", "[reviews PATCH] update_procedure_review", 500);
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const cardId = (result?.card_id ?? null) as number | null;

  // 7. 캐시 무효화.
  try {
    revalidatePath("/");
    revalidateTag("home-feed", "max");
    revalidateTag("home-report", "max");
    if (idCtx.active.handle) {
      revalidatePath(`/${idCtx.active.handle}`);
      revalidatePath(`/${idCtx.active.handle}/${shortcode}`);
    }
  } catch {
    /* noop */
  }

  return NextResponse.json({
    card_id: cardId,
    shortcode,
    status,
    blinded: blindedCount > 0,
    screening: screeningFlagged
      ? {
          status: "pending_review" as const,
          reasons: screeningReasons,
          userMessage:
            "후기가 자동 검수에서 의심 표현으로 감지되어 검토 대기로 전환되었습니다. 운영자 검토 후 공개 여부가 결정됩니다.",
        }
      : null,
  });
}
