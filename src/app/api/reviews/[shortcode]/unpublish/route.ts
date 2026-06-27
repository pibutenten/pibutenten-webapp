import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { revalidateProcedureReports } from "@/lib/review-report-revalidate";

export const dynamic = "force-dynamic";

/**
 * POST /api/reviews/{shortcode}/unpublish — 공개 시술후기 철회(내리기).
 *
 * unpublish_review RPC(0297) 를 위임. cards soft-delete(deleted_at) + procedure_reviews.
 * is_public=false 를 한 트랜잭션에서 원자적으로 수행(§3.5 (A)안). 권한(작성자 묶음 또는 admin)은
 * RPC 내부(42501 → 403). 재공개(토글)는 v1 미지원 — 내리기 단방향.
 *
 * 철회 후 그 카드의 리포트도 stale → /reports/{procedure}(+ 패밀리 부모) + 단일 글 + 피드 재검증.
 *
 * CSRF Origin 검증은 middleware.ts 가 unsafe-method /api/* 에 적용(라우트 무중복).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await ctx.params;
  if (!shortcode || !/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) {
    return errorResponse(null, "invalid_input", "[reviews unpublish] bad shortcode", 400, undefined, {
      userMessage: "잘못된 주소입니다.",
    });
  }

  const supabase = await createSupabaseServerClient();

  // 1. active identity.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[reviews unpublish] auth required", 401);
  }
  const user = idCtx.user;

  // 2. rate limit.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "reviews-unpublish",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 3. 재검증 대상 procedure_ko 를 내리기 전에 미리 확보(soft-delete 후엔 read_public RLS 로
  //    조회가 막힐 수 있어 사전 조회). procedure_reviews → cards(shortcode) 임베드는 검증된
  //    `card:cards!inner` 패턴(procedure-report.ts) 그대로. 실패해도 철회는 진행(리포트 재검증만 생략).
  let procedureKo: string | null = null;
  try {
    const { data: prRow } = await supabase
      .from("procedure_reviews")
      .select("procedure_ko, card:cards!inner(shortcode, type, deleted_at)")
      .eq("card.shortcode", shortcode)
      .eq("card.type", "review")
      .is("card.deleted_at", null)
      .maybeSingle<{ procedure_ko: string }>();
    procedureKo = prRow?.procedure_ko ?? null;
  } catch {
    /* 사전 조회 실패는 리포트 재검증만 생략 */
  }

  // 4. RPC unpublish_review — 카드 soft-delete + 후기 is_public=false 원자. 권한·존재 검증은 RPC.
  const { data: rpcData, error: rpcErr } = await supabase.rpc("unpublish_review", {
    p_shortcode: shortcode,
    p_card_id: null,
  });
  if (rpcErr) {
    const code = (rpcErr as { code?: string }).code ?? "";
    const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";
    if (code === "P0002" || msg.includes("card_not_found")) {
      return errorResponse(rpcErr, "not_found", "[reviews unpublish] card_not_found", 404, undefined, {
        userMessage: "내릴 후기를 찾을 수 없습니다.",
      });
    }
    if (code === "42501" || msg.includes("not_authorized")) {
      return errorResponse(rpcErr, "forbidden", "[reviews unpublish] not_authorized", 403, undefined, {
        userMessage: "본인 후기만 내릴 수 있습니다.",
      });
    }
    if (code === "22023" || msg.includes("missing_identifier")) {
      return errorResponse(rpcErr, "invalid_input", "[reviews unpublish] rpc validation", 400, undefined, {
        userMessage: "잘못된 요청입니다.",
      });
    }
    return errorResponse(rpcErr, "save_failed", "[reviews unpublish] unpublish_review", 500);
  }

  const cardId = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as number | null;

  // 5. 캐시 무효화 — 피드 + 프로필 + 단일 글 + 리포트(+ 패밀리 부모).
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
  if (procedureKo) {
    try {
      await revalidateProcedureReports(supabase, procedureKo);
    } catch {
      /* revalidate 실패는 철회 성공에 영향 X */
    }
  }

  return NextResponse.json({ card_id: cardId, unpublished: true });
}
