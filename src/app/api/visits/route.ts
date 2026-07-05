import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { VisitCreateSchema } from "@/lib/schema/api/visits";
import { screenContent, maskProhibitedMentions } from "@/lib/content-screening";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

type SubmitStatus = "pending_review" | "published";

/**
 * POST /api/visits — 통합 작성(시술노트 + 시술목록 + 시계열 후기 + day0).
 *
 * create_visit_with_entries RPC(0297) 를 위임. diaries 1행 + diary_procedures N행 +
 * (옵션) procedure_reviews M행 + (옵션) day0 review_checkin + (옵션) 트랙A 예약을
 * 한 트랜잭션에서 원자적으로 생성.
 *
 * 흐름(/api/reviews + 옛 /api/diaries 패턴 계승 — /api/diaries 는 본 라우트로 대체 후 삭제, R6-1):
 *   1. active identity 확인 (없으면 401).
 *   2. role=user + 공개 후기(is_public=true)가 1건이라도 있으면 온보딩 게이트 검사.
 *   3. rate limit (분당 10회).
 *   4. zod .strict() 검증(Mass Assignment 방어).
 *   5. 시술명 → tag_dictionary(is_procedure) 매칭(있는 것만 tag_dict_ko 연결, FK 위반 방지).
 *   6. 공개 후기(is_public=true)별로 마스킹(maskProhibitedMentions) + 소프트 검수(screenContent)
 *      → status 분기 + shortcode 생성 후 card 객체 주입(/api/reviews 로직 재사용).
 *   7. RPC 호출. auth.uid() 소유 검증·CHECK 는 RPC 내부.
 *   8. revalidatePath(피드 + 프로필 + 공개 후기 shortcode).
 *
 * CSRF Origin 검증은 middleware.ts 가 모든 unsafe-method /api/* 요청에 적용(라우트 무중복).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  // 1. active identity — visit·후기의 소유자(author/profile) = active 명함.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[visits POST] auth required", 401, undefined, {
      userMessage: "로그인 후 저장할 수 있어요.",
    });
  }
  const user = idCtx.user;
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user" | "clinic";

  // 3. rate limit — 도배 방어(통합 작성은 무거우므로 분당 10회).
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "visits-post",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 4. zod .strict() 검증.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[visits POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식입니다.",
    });
  }
  const parsed = VisitCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(null, "invalid_input", "[visits POST] zod", 400, undefined, {
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

  // 2. 온보딩 게이트 — role=user + 공개 후기(is_public=true)가 있을 때만(공개 콘텐츠 경로).
  //    비공개 시계열·순수 기록만이면 게이트 없음(옛 /api/diaries 와 동일 정책).
  const hasPublicReview = p.reviews.some((r) => r.is_public === true);
  if (
    role === ROLES.USER &&
    hasPublicReview &&
    (!idCtx.active.birthdate || !idCtx.active.termsAgreedAt)
  ) {
    return errorResponse(null, "forbidden", "[visits POST] onboarding_required", 403, undefined, {
      userMessage: "프로필 기본 정보를 먼저 입력해주세요.",
    });
  }

  // 5. 시술명 → tag_dictionary(is_procedure) 매칭. diary_procedures 의 tag_dict_ko 연결용.
  const procKos = Array.from(new Set(p.procedures.map((pr) => pr.procedure_ko)));
  let validTags = new Set<string>();
  if (procKos.length > 0) {
    const { data: tagRows } = await supabase
      .from("tag_dictionary")
      .select("ko")
      .eq("is_procedure", true)
      .in("ko", procKos);
    validTags = new Set((tagRows ?? []).map((r) => (r as { ko: string }).ko));
  }

  // 6. 공개 후기 가공 — is_public=true 후기별로 마스킹 + 소프트 검수 + shortcode 생성 후 card 주입.
  //    /api/reviews 의 마스킹/검수/shortcode 로직을 재사용해 공개 경로 정합 유지.
  //    blindedCount/screening 은 첫 공개 후기 기준으로 응답에 노출(폼 토스트용).
  let anyBlinded = false;
  let screeningFlagged = false;
  let screeningReasons: string[] = [];

  const reviewsForRpc: Array<Record<string, unknown>> = [];
  const { generateShortcode } = await import("@/lib/shortcode");

  // 한 요청 안에서 이미 채택한 shortcode 추적 — 다건 공개 후기 시 요청 내 자가 충돌 방지.
  //   DB 미존재만 검사하면 같은 요청의 두 후보가 우연히 같을 때 RPC INSERT 에서 UNIQUE 위반(23505)→500.
  const usedShortcodes = new Set<string>();

  // post_year: KST 기준 연도 — admin/draft/publish 와 동일 패턴(+9h offset 후 UTC 메서드 = KST).
  //   구 getUTCFullYear() 직사용은 KST 1/1 00~09시 작성분이 전년으로 기록되는 결함.
  const postYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();

  for (const r of p.reviews) {
    const procedureKo = r.procedure_ko.trim();

    // 공통 결론 칸·시계열 입력(diary_linked 부분 입력 허용).
    const base: Record<string, unknown> = {
      diary_procedure_index: r.diary_procedure_index ?? null,
      procedure_ko: procedureKo,
      is_public: r.is_public,
      source: "diary_linked",
      date_precision: r.date_precision ?? p.visited_on_precision,
      satisfaction: r.satisfaction ?? null,
      pain: r.pain ?? null,
      revisit: r.revisit ?? null,
      effect_areas: r.effect_areas ?? null,
      downtime: r.downtime ?? null,
      effect_onset: r.effect_onset ?? null,
      recommend: r.recommend ?? null,
      solo_price: r.solo_price ?? null,
      checkin_day0: r.checkin_day0 ?? null,
    };

    if (!r.is_public) {
      // 비공개 시계열 — 카드·마스킹·검수·shortcode 없음(개인 추이그래프 전용).
      reviewsForRpc.push(base);
      continue;
    }

    // ── 공개 후기 경로(F3) — /api/reviews 와 동일 가공 ──

    // (a) title 기본값 + 마스킹(병원·의사명 "○○" 치환).
    const rawTitle = (r.title ?? "").trim() || `${procedureKo} 시술후기`;
    const rawBody = (r.body ?? "").trim();
    const maskedTitle = maskProhibitedMentions(rawTitle);
    const maskedBody = maskProhibitedMentions(rawBody);
    const title = maskedTitle.text;
    const body = maskedBody.text;
    if (maskedTitle.count + maskedBody.count > 0) anyBlinded = true;

    // (b) 소프트 검수 — role=user 만. doctor/admin 자동 통과.
    let status: SubmitStatus = "published";
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

    // (c) shortcode 생성 — 충돌 시 최대 5회 재시도(/api/reviews 동일 정책).
    //     채택 조건: DB 미존재 + 이 요청 내 미사용(usedShortcodes) 둘 다 만족. 채택 시 Set 에 추가.
    let shortcode: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateShortcode();
      if (usedShortcodes.has(candidate)) continue;
      const { data: existing } = await supabase
        .from("cards")
        .select("id")
        .eq("shortcode", candidate)
        .maybeSingle();
      if (!existing) {
        shortcode = candidate;
        usedShortcodes.add(candidate);
        break;
      }
    }
    if (!shortcode) {
      return errorResponse(null, "save_failed", "[visits POST] shortcode gen failed", 500, undefined, {
        userMessage: "shortcode 생성 실패 — 잠시 후 다시 시도해주세요.",
      });
    }

    // (d) RPC 의 카드 INSERT 절이 받을 card 객체 주입. body/title 은 마스킹된 최종값.
    base.card = {
      title,
      body,
      keywords: r.keywords && r.keywords.length > 0 ? r.keywords : [procedureKo],
      status,
      shortcode,
      post_year: postYear,
    };
    reviewsForRpc.push(base);
  }

  // 7. RPC create_visit_with_entries — 원자적 부모+자식 생성. 소유검증·CHECK 는 RPC 내부.
  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_visit_with_entries", {
    p_profile_id: idCtx.active.profileId,
    // 회고형 관대화: precision='unknown'(날짜 미기억) 면 visited_on 미전송 → null 포워딩.
    //   RPC 가 NULL 처리 + 재방문 알림 미예약(백엔드 동일 계약).
    p_visited_on: p.visited_on ?? null,
    p_visited_on_precision: p.visited_on_precision,
    p_clinic_id: p.clinic_id ?? null,
    p_clinic_name: p.clinic_name ?? null,
    p_clinic_addr: p.clinic_addr ?? null,
    p_clinic_tel: p.clinic_tel ?? null,
    p_clinic_x: p.clinic_x ?? null,
    p_clinic_y: p.clinic_y ?? null,
    p_clinic_home: p.clinic_home ?? null,
    p_clinic_kakao: p.clinic_kakao ?? null,
    p_doctor_name: p.doctor_name ?? null,
    p_manager_name: p.manager_name ?? null,
    p_diary_body: p.diary_body ?? null,
    p_total_price: p.total_price ?? null,
    p_is_complete: p.is_complete,
    p_procedures: p.procedures.map((pr, i) => ({
      procedure_ko: pr.procedure_ko,
      tag_dict_ko: validTags.has(pr.procedure_ko) ? pr.procedure_ko : null,
      unit_text: pr.unit_text ?? null,
      price: pr.price ?? null,
      note: pr.note ?? null,
      sort_order: i,
    })),
    p_reviews: reviewsForRpc,
  });
  if (rpcErr) {
    const code = (rpcErr as { code?: string }).code ?? "";
    const msg = typeof rpcErr.message === "string" ? rpcErr.message : "";
    // 명함 소유 위반(42501) → 403.
    if (code === "42501" || msg.includes("not_authorized")) {
      return errorResponse(rpcErr, "forbidden", "[visits POST] not_authorized", 403, undefined, {
        userMessage: "권한이 없습니다.",
      });
    }
    // 입력 위반(22023/22001: 시술 0개·범위·미등록 시술 등) → 400.
    if (code === "22023" || code === "22001" || msg.includes("unknown_procedure")) {
      return errorResponse(rpcErr, "invalid_input", "[visits POST] rpc validation", 400, undefined, {
        userMessage: "입력 형식이 올바르지 않습니다.",
      });
    }
    // shortcode UNIQUE 충돌(23505) → 409. 요청 내 중복 방지 후의 잔여 경합(동시 요청 간 race) 방어.
    //   ErrorKind 에 conflict 가 없어 invalid_input(4xx 계열) 로 매핑하되 status 만 409 로 명시.
    if (code === "23505") {
      return errorResponse(rpcErr, "invalid_input", "[visits POST] shortcode conflict", 409, undefined, {
        userMessage: "일시적인 충돌이 발생했어요. 잠시 후 다시 시도해주세요.",
      });
    }
    return errorResponse(rpcErr, "save_failed", "[visits POST] create_visit_with_entries", 500, undefined, {
      userMessage: "저장에 실패했어요. 잠시 후 다시 시도해주세요.",
    });
  }

  // RPC returns (visit_id bigint, review_ids bigint[]). 단일 row 객체 / 배열 양쪽 수용.
  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const visitId = (result?.visit_id ?? null) as number | null;
  const reviewIds = (result?.review_ids ?? []) as number[];

  // 8. 캐시 무효화 — 피드 + 프로필 + 공개 후기 단일 글.
  try {
    revalidatePath("/");
    revalidateTag("home-feed", "max");
    revalidateTag("home-report", "max");
    if (idCtx.active.handle) {
      revalidatePath(`/${idCtx.active.handle}`);
      for (const r of reviewsForRpc) {
        const card = r.card as { shortcode?: string } | undefined;
        if (card?.shortcode) {
          revalidatePath(`/${idCtx.active.handle}/${card.shortcode}`);
        }
      }
    }
  } catch {
    /* revalidatePath 실패는 저장 성공에 영향 X */
  }

  return NextResponse.json({
    visit_id: visitId,
    review_ids: reviewIds,
    blinded: anyBlinded,
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
