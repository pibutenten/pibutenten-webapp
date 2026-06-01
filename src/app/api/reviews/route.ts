import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { ReviewCreateSchema } from "@/lib/schema/api/reviews";
import { screenContent, detectProhibitedMentions } from "@/lib/content-screening";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

type SubmitStatus = "pending_review" | "published";

/**
 * POST /api/reviews — 시술후기(P3) 생성.
 *
 * 시술후기는 일반 글쓰기 폼이 아닌 전용 폼에서만 작성됨.
 * 카드(type=review,category=review) + procedure_reviews 행을 RPC 가 원자적으로 생성.
 *
 * 흐름:
 *   1. active identity 확인 (없으면 401).
 *   2. role=user 면 온보딩 게이트(birthdate/terms) 검사 (articles 와 동일, defense-in-depth).
 *   3. rate limit (분당 5회).
 *   4. zod 형식·크기 검증.
 *   5. procedure_ko 가 procedure_taxonomy 에 존재하는지 검증.
 *   6. title 기본값 (`{시술명} 시술후기`).
 *   7. 하드블록: 병원·의사명 지목 표현 감지 시 제출 차단.
 *   8. 소프트 검수: role=user 면 screenContent → flagged 면 pending_review.
 *   9. shortcode 생성 (충돌 시 최대 5회 재시도).
 *   10. RPC create_procedure_review 호출 (auth.uid() 소유자 검증은 RPC 내부).
 *   11. revalidatePath.
 *   12. 응답 (articles 패턴 — screening 객체 포함).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  // 1. active identity — 묶음 내 ID 전환 시 후기의 author 도 그 profile 로 저장.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[reviews POST] auth required", 401);
  }
  const user = idCtx.user;
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";

  // 2. 온보딩 게이트 재검증 (articles 와 동일) — USER 명함만. middleware 가 /api/* 를
  //    게이트에서 제외하므로 미온보딩 세션의 직접 호출을 여기서 차단.
  if (
    role === ROLES.USER &&
    (!idCtx.active.birthdate || !idCtx.active.termsAgreedAt)
  ) {
    return errorResponse(
      null,
      "forbidden",
      "[reviews POST] onboarding_required",
      403,
      undefined,
      { userMessage: "프로필 기본 정보를 먼저 입력해주세요." },
    );
  }

  // 3. Rate limit — 사용자당 분당 5회. 도배 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "reviews-post",
    userId: user.id,
    max: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 4. zod 검증 — 형식·크기 화이트리스트.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[reviews POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = ReviewCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(
      null,
      "invalid_input",
      "[reviews POST] zod parse",
      400,
      undefined,
      {
        userMessage: "요청 형식이 올바르지 않습니다.",
        devOnly: {
          issues: parsed.error.issues.slice(0, 5).map((iss) => ({
            path: iss.path.join("."),
            code: iss.code,
          })),
        },
      },
    );
  }
  const payload = parsed.data;
  const procedureKo = payload.procedure_ko.trim();

  // 5. 시술명 존재 검증 — procedure_taxonomy.ko 와 매칭.
  const { data: taxRow } = await supabase
    .from("procedure_taxonomy")
    .select("ko")
    .eq("ko", procedureKo)
    .maybeSingle();
  if (!taxRow) {
    return errorResponse(null, "invalid_input", "[reviews POST] procedure not found", 400, undefined, {
      userMessage: "유효한 시술을 선택해주세요.",
    });
  }

  // 6. title 기본값.
  const title = (payload.title ?? "").trim() || `${procedureKo} 시술후기`;
  const body = (payload.body ?? "").trim();

  // 7. 하드블록 — 병원·의사명 지목 표현 감지 시 제출 차단.
  const prohibited = detectProhibitedMentions(`${title}\n${body}`);
  if (prohibited.blocked) {
    return errorResponse(null, "invalid_input", "[reviews POST] prohibited mention", 400, undefined, {
      userMessage:
        "병원·의사명으로 보이는 표현이 포함되어 등록할 수 없습니다: " +
        prohibited.matches.join(", ") +
        " — 해당 표현을 빼고 다시 작성해주세요.",
    });
  }

  // 8. 소프트 검수 — role=user 만. doctor/admin 은 screenContent 가 자동 통과.
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

  // 9. shortcode 생성 — 충돌 시 최대 5회 재시도 (articles 와 동일 정책).
  let shortcode: string | null = null;
  {
    const { generateShortcode } = await import("@/lib/shortcode");
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateShortcode();
      const { data: existing } = await supabase
        .from("cards")
        .select("id")
        .eq("shortcode", candidate)
        .maybeSingle();
      if (!existing) {
        shortcode = candidate;
        break;
      }
    }
    if (!shortcode) {
      return errorResponse(null, "save_failed", "[reviews POST] shortcode gen failed", 500, undefined, {
        userMessage: "shortcode 생성 실패 — 잠시 후 다시 시도해주세요.",
      });
    }
  }

  // 10. RPC — 카드 + procedure_reviews 원자적 생성. auth.uid() 소유자 검증은 RPC 내부.
  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_procedure_review", {
    p_author_id: idCtx.active.profileId,
    p_procedure_ko: procedureKo,
    p_title: title,
    p_body: body,
    p_keywords: [procedureKo],
    p_status: status,
    p_shortcode: shortcode,
    p_post_year: new Date().getUTCFullYear(),
    p_satisfaction: payload.satisfaction,
    p_effect: payload.effect,
    p_pain: payload.pain,
    p_recovery_days: payload.recovery_days,
    p_would_recommend: payload.would_recommend,
    p_area: payload.area ?? null,
    p_cost_satisfaction: payload.cost_satisfaction ?? null,
    p_effect_areas: payload.effect_areas ?? null,
  });
  if (rpcErr) {
    return errorResponse(rpcErr, "save_failed", "[reviews POST] create_procedure_review", 500);
  }

  // RPC returns (card_id bigint, shortcode text). supabase-js 는 SETOF/RETURNS TABLE 을
  // 배열로, 단일 row 를 객체로 반환할 수 있어 양쪽 모두 수용.
  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const cardId = (result?.card_id ?? null) as number | null;
  const outShortcode = (result?.shortcode ?? shortcode) as string;

  // 11. 캐시 무효화 — 메인 피드 + 작성자 프로필.
  try {
    revalidatePath("/");
    if (idCtx.active.handle) revalidatePath(`/${idCtx.active.handle}`);
  } catch {
    /* revalidatePath 실패는 저장 성공에 영향 X */
  }

  // 12. 응답 — articles 패턴 (screening 객체 포함).
  return NextResponse.json({
    card_id: cardId,
    shortcode: outShortcode,
    status,
    screening: screeningFlagged
      ? {
          status: "pending_review" as const,
          reasons: screeningReasons,
          userMessage:
            "후기가 자동 검수에서 의료광고·환자후기 등 의심 표현으로 감지되어 검토 대기로 전환되었습니다. 운영자 검토 후 공개 여부가 결정됩니다.",
        }
      : null,
  });
}
