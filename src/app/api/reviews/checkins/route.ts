import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { CheckinUpsertSchema } from "@/lib/schema/api/visits";
import { revalidateProcedureReports } from "@/lib/review-report-revalidate";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/reviews/checkins — 시계열 체크인 upsert(day0/week1/month1/month4).
 *
 * upsert_review_checkin RPC(0297) 를 위임. review_checkin UPSERT + procedure_reviews 결론칸
 * 롤업(만족도·추천=최신 시점, 통증=day0)을 한 트랜잭션에서 수행. 권한(후기 author 명함 소유)은
 * RPC 내부(42501 → 403).
 *
 * ★F3 재검증 계약(§3.3): 롤업이 결론칸을 사후 변동시키므로, 그 후기가 공개(is_public=true,
 *   card_id 보유)면 /reports/{en}(+ 패밀리 부모) ISR·JSON-LD aggregateRating 이 stale 이 된다.
 *   성공 후 그 후기의 procedure_ko → 영향 리포트 경로를 revalidatePath(API 레이어 책임).
 *
 * CSRF Origin 검증은 middleware.ts 가 unsafe-method /api/* 에 적용(라우트 무중복).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  // 1. active identity — 체크인은 후기 author 명함 소유자만(RPC 가 auth.uid() 로 검증).
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[checkins POST] auth required", 401, undefined, {
      userMessage: "로그인 후 작성할 수 있어요.",
    });
  }
  const user = idCtx.user;

  // 2. rate limit.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "checkins-post",
    userId: user.id,
    max: 20,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 3. zod .strict() 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[checkins POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = CheckinUpsertSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[checkins POST] zod", 400, undefined, {
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

  // 4. RPC upsert_review_checkin — UPSERT + 결론칸 롤업 + 단답 저장(checkin_id 연결).
  //    소유·존재 검증은 RPC 내부. 단답은 빈 답·미존재 질문을 RPC 가 무시(저장 제외).
  const { data: checkinId, error: rpcErr } = await supabase.rpc("upsert_review_checkin", {
    p_review_id: p.review_id,
    p_timepoint: p.timepoint,
    p_satisfaction: p.satisfaction ?? null,
    p_recommend: p.recommend ?? null,
    p_effect_felt: p.effect_felt ?? null,
    p_pain: p.pain ?? null,
    p_changed_points: p.changed_points ?? null,
    p_short_answers: p.short_answers ?? null,
  });
  if (rpcErr) {
    const code = (rpcErr as { code?: string }).code ?? "";
    const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";
    if (code === "P0002" || msg.includes("review_not_found")) {
      return errorResponse(rpcErr, "not_found", "[checkins POST] review_not_found", 404, undefined, {
        userMessage: "대상 후기를 찾을 수 없습니다.",
      });
    }
    if (code === "42501" || msg.includes("not_authorized")) {
      return errorResponse(rpcErr, "forbidden", "[checkins POST] not_authorized", 403, undefined, {
        userMessage: "본인 후기만 작성할 수 있습니다.",
      });
    }
    // 22023/22001(string_data_right_truncation) → 400. 다른 visit 라우트와 에러매핑 일관성.
    if (code === "22023" || code === "22001" || msg.includes("invalid_timepoint")) {
      return errorResponse(rpcErr, "invalid_input", "[checkins POST] rpc validation", 400, undefined, {
        userMessage: "입력 형식이 올바르지 않습니다.",
      });
    }
    return errorResponse(rpcErr, "save_failed", "[checkins POST] upsert_review_checkin", 500, undefined, {
      userMessage: "저장에 실패했어요. 잠시 후 다시 시도해주세요.",
    });
  }

  // 5. ★F3 — 공개 후기면 /reports 재검증(롤업이 집계·JSON-LD 사후 변동시킴).
  //    그 후기가 공개(is_public=true AND card_id NOT NULL)일 때만 리포트가 영향받는다.
  //    procedure_ko 조회 후 자기+부모 리포트 경로 revalidate(비공개면 경로 산출 없이 skip).
  try {
    const { data: revRow } = await supabase
      .from("procedure_reviews")
      .select("procedure_ko, is_public, card_id")
      .eq("id", p.review_id)
      .maybeSingle<{ procedure_ko: string; is_public: boolean; card_id: number | null }>();
    if (revRow?.is_public && revRow.card_id !== null && revRow.procedure_ko) {
      await revalidateProcedureReports(supabase, revRow.procedure_ko);
      // 홈 리포트 풀 unstable_cache 무효화 — 체크인 롤업이 만족도·count 집계를 사후 변동시킴.
      revalidateTag("home-report", "max");
    }
  } catch {
    /* revalidate 실패는 저장 성공에 영향 X */
  }

  const result = Array.isArray(checkinId) ? checkinId[0] : checkinId;
  return NextResponse.json({ checkin_id: result ?? null });
}
