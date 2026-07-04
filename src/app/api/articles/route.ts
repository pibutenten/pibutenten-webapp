import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import {
  buildSlug,
  resolveSlugCollision,
} from "@/data/procedure-mappings/slug-mapping";
import { ArticleCreateSchema } from "@/lib/schema/api/articles";
import { screenContent } from "@/lib/content-screening";
import {
  stripCategoryLabels,
  isPostCategorySlug,
  categoriesForRole,
} from "@/lib/post-category";
import { ROLES } from "@/lib/identity-shared";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// post / qa 만 지원
type WriteType = "post" | "qa";

type SubmitStatus = "draft" | "pending_review" | "published";

/**
 * POST /api/articles
 *
 * 글쓰기 통합 엔드포인트. category 가 진실원 — type 은 category 에서 파생 (R1-4).
 * - category='doodle' (type='post') : 일반 글 (모든 로그인 유저). 즉시 published.
 * - category='qa'     (type='qa')   : 관리자/원장이 작성. status='pending_review'.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  // Phase 9: active identity 기반 — 묶음 내 ID 전환 시 글의 author도 그 profile로 저장.
  // 구 버그: user.id (= base auth.users.id) 만 사용해 항상 base profile(보통 의사)로 저장 →
  //   회원 모드로 작성한 글이 의사 핸들 슬러그(/bae-jungmin/...)로 노출되는 문제.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[articles POST] auth required", 401);
  }
  const user = idCtx.user;
  // role은 active identity 기준 (회원 ID로 전환 중이면 'user', 의사 ID면 'doctor')
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";

  // P1-⑦ (2026-05-29): API 라우트 온보딩 재검증 — defense-in-depth.
  //   middleware 가 /api/* 를 게이트에서 제외하므로 미온보딩 세션이 클라 우회로
  //   직접 호출하면 회피 가능. USER 명함만 검증 (admin/doctor 는 signup 단계에서
  //   온보딩 스킵 — ADR 0012). 14세 차단은 DB CHECK + RLS 가 별도로 보장.
  //   resolveActiveIdentity 의 SELECT 에 birthdate/terms_agreed_at 동시 조회 추가 →
  //   여기서 별도 SELECT 없음.
  if (
    role === ROLES.USER &&
    (!idCtx.active.birthdate || !idCtx.active.termsAgreedAt)
  ) {
    return errorResponse(
      null,
      "forbidden",
      "[articles POST] onboarding_required",
      403,
      undefined,
      { userMessage: "프로필 기본 정보를 먼저 입력해주세요." },
    );
  }

  // Rate limit (A8): 사용자당 분당 5회. 글 도배 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "articles-post",
    userId: user.id,
    max: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // zod 스키마 검증 (보안 2.5차 D-3) — 형식·크기 화이트리스트.
  // 라우트 단의 추가 권한·status 분기 검증은 아래에서 별도 수행.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[articles POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = ArticleCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(
      null,
      "invalid_input",
      "[articles POST] zod parse",
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

  // ── 카테고리 결정 + type 파생 (R1-4 / M-3, 2026-07-04) ────────────────
  // category 가 진실원(SSOT) — 클라이언트가 보낸 type 은 신뢰하지 않고 category 에서
  // 파생. PUT(articles/[id]) 의 `update.type = nextCategory === "qa" ? "qa" : "post"`
  // 와 동일 규칙. 구 버그: type·category 를 각각 독립 검증만 해 의사·관리자 role 이면
  // type='post'+category='qa' 같은 모순 조합이 통과 → DB 에 type↔category 불일치 row
  // 생성 가능했음.
  //   · isPostCategorySlug : 유효 슬러그(qa/doodle/review/review_summary) 검증 → 아니면 400.
  //   · categoriesForRole  : 역할 허용 범위(회원=doodle / 의사·관리자=qa+doodle) → 벗어나면 403.
  //     구 "qa role denied" 별도 게이트(type 기준)는 이 403 이 동일하게 커버 — 제거.
  //   · review/review_summary 는 categoriesForRole 에 없어 일반 글쓰기 POST 로는 자연 차단(전용 폼만).
  // payload.type 은 category 미전송 payload 의 폴백 입력으로만 사용 (qa→qa, 그 외→doodle
  // 로 category 를 먼저 정한 뒤 type 을 재파생하므로 모순 조합이 원천 불가).
  let category: string;
  if (typeof payload.category === "string") {
    if (!isPostCategorySlug(payload.category)) {
      return errorResponse(null, "invalid_input", "[articles POST] invalid category", 400, undefined, {
        userMessage: "유효하지 않은 카테고리",
      });
    }
    category = payload.category;
  } else {
    category = payload.type === "qa" ? "qa" : "doodle";
  }
  if (!categoriesForRole(role).some((c) => c.slug === category)) {
    return errorResponse(null, "forbidden", "[articles POST] category not allowed", 403, undefined, {
      userMessage:
        category === "qa"
          ? "Q&A 카테고리는 원장 또는 관리자만 작성 가능합니다."
          : "이 카테고리는 사용 권한이 없습니다.",
    });
  }
  // type 파생 — 이후 doctor 매핑·본문 분기·insert 전부 이 값 사용.
  const t: WriteType = category === "qa" ? "qa" : "post";

  // status 결정 — 클라이언트가 보낸 값 검증
  const reqStatus: SubmitStatus = payload.status ?? "published";
  if (
    reqStatus !== "draft" &&
    reqStatus !== "pending_review" &&
    reqStatus !== "published"
  ) {
    return errorResponse(null, "invalid_input", "[articles POST] invalid status", 400, undefined, {
      userMessage: "유효하지 않은 status",
    });
  }
  // pending_review는 admin이 원장 명의로 작성할 때만 의미 있음
  if (reqStatus === "pending_review" && role !== ROLES.ADMIN) {
    return errorResponse(null, "forbidden", "[articles POST] pending_review denied", 403, undefined, {
      userMessage: "검수 요청 권한이 없습니다.",
    });
  }

  const keywords = (payload.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);

  // doctor_id 매핑
  let doctorId: string | null = null;

  if (t === "qa") {
    const slug = (payload.doctor_slug ?? "").trim();
    if (!slug) {
      return errorResponse(null, "invalid_input", "[articles POST] doctor_slug missing", 400, undefined, {
        userMessage: "원장을 선택해주세요.",
      });
    }
    const { data: d } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!d) {
      return errorResponse(null, "invalid_input", "[articles POST] doctor not found", 400, undefined, {
        userMessage: "원장을 찾을 수 없습니다.",
      });
    }
    doctorId = d.id;
  }
  // post는 doctor_id null

  // ── post_slug + post_year 자동 생성 (PRD §11-A SEO URL 정책) ─────────
  // post_year: 발행 연도 (서버 기준, KST 무관 — DB에서 EXTRACT YEAR로 동일 결과)
  const postYear = new Date().getUTCFullYear();
  // post_slug: buildSlug() 가 내부에서 영문 단어 3개(최대 4개) + 부분 중복 제거 적용.
  //  → keywords 배열 전체를 넘기되, 내부에서 1st/2nd 우선 + 단어 수 자동 제어.
  //  → 50자 초과 cut + URL 가독성 + Twitter/카톡 미리보기 잘림 방지.
  // 같은 의사·연도 내 충돌 시 -2/-3 부여.
  let postSlug: string | null = null;
  if (doctorId && keywords.length > 0) {
    // 첫 5개까지 슬러그 빌더에 전달 (내부에서 단어 수 따라 자동 trim)
    const slugTags = keywords.slice(0, 5);
    const baseSlug = buildSlug(slugTags);
    if (baseSlug && !baseSlug.startsWith("untagged-")) {
      const { data: existing } = await supabase
        .from("cards")
        .select("post_slug")
        .eq("doctor_id", doctorId)
        .eq("post_year", postYear)
        .not("post_slug", "is", null);
      const existingSet = new Set<string>(
        (existing ?? [])
          .map((r) => r.post_slug as string | null)
          .filter((s): s is string => !!s),
      );
      postSlug = resolveSlugCollision(baseSlug, existingSet);
    }
  }

  // 카테고리 라벨은 카드 헤더(닉네임 밑) + 태그 칩 끝에 자동 표시.
  // 사용자가 카테고리 라벨을 keywords에 직접 입력했으면 중복 방지로 제거.
  // SSOT — `lib/category-labels.ts` 의 `stripCategoryLabels` 헬퍼 사용 (ADR 0012 정합).
  const filteredKeywords = stripCategoryLabels(keywords);
  keywords.length = 0;
  keywords.push(...filteredKeywords.slice(0, 8));

  // 외부 링크 — 옵션. URL 형식 검증 후 메타와 함께 저장
  const extUrlRaw = (payload.external_url ?? "").trim();
  let extFields: Record<string, unknown> = {};
  if (extUrlRaw) {
    try {
      const u = new URL(
        extUrlRaw.startsWith("http") ? extUrlRaw : `https://${extUrlRaw}`,
      );
      if (u.protocol === "http:" || u.protocol === "https:") {
        extFields = {
          external_url: u.toString(),
          external_title: payload.external_meta?.title ?? null,
          external_description: payload.external_meta?.description ?? null,
          external_image: payload.external_meta?.image ?? null,
          external_site_name:
            payload.external_meta?.siteName ?? u.hostname ?? null,
        };
      }
    } catch {
      /* invalid URL — 무시 (저장 안 함) */
    }
  }

  // shortcode 생성 — 모든 카드(post/qa, 회원/doctor)에 부여.
  //   - 회원 글: viewer URL `/{handle}/{shortcode}` 의 식별자.
  //   - doctor 글: viewer URL 은 `/doctors/{slug}/{year}/{post-slug}` 지만,
  //     수정 라우트 `/write/{shortcode}` 가 shortcode 만 받기 때문에 카드 케밥의
  //     "수정" 메뉴 노출에 필수 (`getQaEditUrl` 이 shortcode null 이면 null 반환 →
  //     케밥에 삭제만 노출되던 회귀 fix, 260517).
  //   - admin/draft/publish 경로(YouTube 일괄 발행)도 doctor 카드에 이미 shortcode
  //     생성 중 → 동일 정책.
  // 충돌 시 최대 5회 재시도 (8자 base58 = ~128조 조합으로 사실상 충돌 0).
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
      return errorResponse(null, "save_failed", "[articles POST] shortcode gen failed", 500, undefined, {
        userMessage: "shortcode 생성 실패 — 잠시 후 다시 시도해주세요.",
      });
    }
  }

  // 본문 검증 + insert payload 구성.
  // author_id에 active identity의 profile.id 사용 — 묶음 내 ID 전환 시 글의 작성자도 그 ID로 기록됨.
  // (좋아요·저장·댓글과 동일한 ID 정책.)
  const insert: Record<string, unknown> = {
    type: t,
    category,
    author_id: idCtx.active.profileId,
    keywords,
    post_year: postYear,
    post_slug: postSlug,
    shortcode,
    hide_doctor_credential: Boolean(payload.hide_doctor_credential),
    ...extFields,
  };

  if (t === "post") {
    const title = (payload.title ?? "").trim();
    const body = (payload.body ?? "").trim();
    if (!title) {
      return errorResponse(null, "invalid_input", "[articles POST] empty title", 400, undefined, {
        userMessage: "제목을 입력해주세요.",
      });
    }
    if (!body) {
      return errorResponse(null, "invalid_input", "[articles POST] empty body", 400, undefined, {
        userMessage: "본문을 입력해주세요.",
      });
    }
    if (body.length > 4000) {
      return errorResponse(null, "invalid_input", "[articles POST] body too long", 400, undefined, {
        userMessage: "본문은 최대 4000자까지 가능합니다.",
      });
    }
    insert.title = title;
    insert.body = body;
    insert.status = reqStatus;
    // doctor_id — active identity가 의사 매핑된 row일 때만 doctor 페이지에 노출
    insert.doctor_id = doctorId;
  } else if (t === "qa") {
    // P2-4 (2026-05-27): API 입력 키 question/answer → title/body 통일.
    const q = (payload.title ?? "").trim();
    const a = (payload.body ?? "").trim();
    if (!q || !a) {
      return errorResponse(null, "invalid_input", "[articles POST] qa fields missing", 400, undefined, {
        userMessage: "질문과 답변을 모두 입력해주세요.",
      });
    }
    insert.title = q;
    insert.body = a;
    // 클라이언트가 보낸 status 존중 (draft/pending_review/published).
    // 이전 버그: status를 항상 pending_review로 강제 덮어써서 "저장"(draft) 버튼이 검수 큐로 직행함.
    insert.status = reqStatus;
    insert.doctor_id = doctorId;
    // 2026-05-27 회귀 fix: WriteClient 가 pubmed_refs 전송했는데 라우트가 insert payload 에
    // 안 넣어 저장 누락되던 잠재 버그. ArticleUpdate 와 동일하게 명시 저장.
    //   null = 비우기 (사용자가 모두 X 한 경우), undefined = 미전송 → 그대로.
    if ("pubmed_refs" in payload) {
      insert.pubmed_refs = payload.pubmed_refs ?? null;
    }
  }

  // 보안 2.5차 E묶음 (2026-05-19): 자동 콘텐츠 검수기.
  // 의사·관리자는 자동 통과. 회원 글에서 의료광고·약사법 의심 패턴 임계점 초과 시
  // status 강제 pending_review + screening_flags 저장 → admin 검토 큐로.
  //
  // 2026-05-28 (P1-②): silent fail 방지 — verdict 를 상위 scope 으로 끌어올려
  // 응답에 screening 필드 포함. 클라이언트(WriteClient) 가 사용자에게 토스트 안내.
  let screeningFlagged = false;
  let screeningReasons: string[] = [];
  if (role === ROLES.USER) {
    const verdict = screenContent({
      title: insert.title as string | null,
      body: insert.body as string | null,
      keywords,
      externalUrl: (insert.external_url as string | null) ?? null,
      authorRole: "user",
    });
    if (verdict.flagged) {
      insert.status = "pending_review";
      insert.screening_flags = verdict.reasons;
      screeningFlagged = true;
      screeningReasons = verdict.reasons;
    }
  }

  const { data: row, error: insErr } = await supabase
    .from("cards")
    .insert(insert)
    .select("id, type, status, post_slug, post_year, shortcode")
    .single();

  if (insErr) {
    // A10: 상세 메시지는 로그에만, 사용자엔 일반 문구 + error_id.
    return errorResponse(insErr, "save_failed", "[articles] cards insert", 500);
  }

  // P1-⑤ (2026-05-28): 검수에 의해 status='pending_review' 강제된 회원 글은 audit 적재.
  // PIPA 안전성 확보조치 §8 — 콘텐츠 자동 차단 추적. admin 명시 status 변경은
  // PUT 의 card.admin_update 가 별도로 잡음 (중복 회피).
  if (screeningFlagged) {
    await logAudit({
      action: "card.status_change",
      actorProfileId: idCtx.active.profileId,
      actorAuthUserId: idCtx.user.id,
      targetTable: "cards",
      targetId: row.id,
      request: req,
      metadata: {
        from_status: "(create)",
        to_status: "pending_review",
        cause: "screening_auto",
        reasons: screeningReasons,
      },
    });
  }

  // 캐시 무효화 — 대시보드 KPI/카드 목록/회원 프로필 즉시 갱신.
  // (point-in-time 카운트는 매번 fresh fetch지만, Next.js RSC payload 캐시·full route cache 모두 무효화)
  try {
    // V3: ISR 상세·토픽 캐시(tag) 무효화 — 새 카드가 토픽/상세에 즉시 반영.
    revalidateTag("qa-content", "max");
    revalidateTag("topics", "max");
    revalidateTag("home-feed", "max");
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/cards");
    if (doctorId) {
      const { data: docRow } = await supabase
        .from("doctors")
        .select("slug")
        .eq("id", doctorId)
        .maybeSingle();
      if (docRow?.slug) revalidatePath(`/doctors/${docRow.slug}`);
    }
    if (idCtx.active.handle) revalidatePath(`/${idCtx.active.handle}`);
  } catch {
    /* revalidatePath 실패는 저장 성공에 영향 X */
  }

  return NextResponse.json({
    id: row.id,
    type: row.type,
    status: row.status,
    post_slug: row.post_slug,
    post_year: row.post_year,
    shortcode: row.shortcode,
    // P1-② (2026-05-28): silent fail 방지. 검수에 걸린 회원 글은 pending_review 로
    // 들어가고 admin 검토 큐로 가지만, 사용자 화면엔 redirect 만 일어나 안 보임.
    // 클라이언트가 screening 객체 존재 여부만 보고 토스트 1회 노출 (CommentsBlock 패턴).
    screening: screeningFlagged
      ? {
          status: "pending_review" as const,
          reasons: screeningReasons,
          userMessage:
            "글이 자동 검수에서 의료광고·환자후기 등 의심 표현으로 감지되어 검토 대기로 전환되었습니다. 운영자 검토 후 공개 여부가 결정됩니다.",
        }
      : null,
  });
}
