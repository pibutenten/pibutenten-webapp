/**
 * PUT /api/articles/[id] — 기존 카드 수정 (260518 Phase 3).
 *
 * 통합 목표: EditClient (회원/원장) 와 admin EditClient 가 동일 통로(이 API)로 저장.
 * 이전: 두 EditClient 가 각각 `supabase.from('cards').update()` 직접 호출 → 권한 사고
 * 표면이 두 군데 (RLS + 진입 가드). 본 라우트는 한 군데에서 권한·검증 통일.
 *
 * 권한 (POST /api/articles 의 isAdmin/isAuthor/isDoctorOfQa 와 동일 패턴):
 *   - active.role='admin' → 모든 카드 수정 가능
 *   - 카드 author_id 가 묶음 안 어떤 profile 이면 → 본인 글 수정 가능
 *   - active.role='doctor' + 그 doctor 의 카드면 → 본인 doctor 카드 수정 가능
 *
 * 페이로드 (모두 optional — undefined 면 미수정):
 *   - title, body, keywords (옛 question/answer 는 0171 마이그에서 리네임)
 *   - category (변경 시 type 도 함께)
 *   - external_url + external_title/description/image/site_name
 *   - pubmed_refs (배열) — ADR 0012 단일 출처
 *   - status (admin 만)
 *   - is_pick (admin 만)
 *   - doctor_id (admin 만)
 *   - deleted_at (admin 만 — soft-delete/복구)
 *
 * Rate limit: 사용자당 분당 10회 (수정은 작성보다 자주 발생 가능).
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { ArticleUpdateSchema, type PubmedRefObj } from "@/lib/schema/api/articles";
import { screenContent } from "@/lib/content-screening";
import {
  categoriesForRole,
  isPostCategorySlug,
  type PostCategorySlug,
} from "@/lib/post-category";
import { ROLES } from "@/lib/identity-shared";
import { logAudit } from "@/lib/audit-log";
import {
  isValidPostSlug,
  normalizeToSlug,
} from "@/data/procedure-mappings/slug-mapping";
import { isSlugUniqueViolation, SLUG_TAKEN_MESSAGE } from "@/lib/slug-conflict";

export const dynamic = "force-dynamic";

type Status = "draft" | "pending_review" | "published" | "archived" | "hidden";

type Payload = {
  // P2-4 (2026-05-27): API 입력 키 title/body 통일.
  title?: string;
  body?: string;
  keywords?: string[];
  category?: string;
  // type 은 클라이언트가 보내도 무시 — category 에서 파생.
  external_url?: string | null;
  external_title?: string | null;
  external_description?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  pubmed_refs?: PubmedRefObj[] | null;
  // admin 전용
  status?: Status;
  is_pick?: boolean;
  doctor_id?: string | null;
  deleted_at?: string | null;
  // admin edit — 잠금 전(status=draft) 의사 글 URL slug 수정.
  post_slug?: string;
  // 배치 ⑤ 6번 (2026-05-28): admin 전용 — author 변경 + meta JSON 갱신 (EditClient → PUT 통일).
  author_id?: string | null;
  meta?: string | null;
};

const STATUS_SET = new Set<Status>([
  "draft",
  "pending_review",
  "published",
  "archived",
  "hidden",
]);

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const cardId = Number.parseInt(idStr, 10);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return errorResponse(null, "invalid_input", "[articles PUT] invalid id", 400, undefined, {
      userMessage: "유효하지 않은 카드 id",
    });
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[articles PUT] auth required", 401);
  }
  const user = idCtx.user;
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";

  // Rate limit — 사용자당 분당 10회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "articles-put",
    userId: user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // zod 스키마 검증 (보안 2.5차 D-3) — 형식·크기 화이트리스트.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(e, "invalid_input", "[articles PUT] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }
  const parsed = ArticleUpdateSchema.safeParse(rawJson);
  if (!parsed.success) {
    return errorResponse(
      null,
      "invalid_input",
      "[articles PUT] zod parse",
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
  const payload = parsed.data as Payload;

  // 카드 조회 — 권한 검증용.
  const { data: card, error: fetchErr } = await supabase
    .from("cards")
    .select("id, type, category, author_id, doctor_id, deleted_at, status, post_year")
    .eq("id", cardId)
    .maybeSingle();
  if (fetchErr) {
    return errorResponse(fetchErr, "generic", "[articles PUT] fetch", 500);
  }
  if (!card) {
    return errorResponse(null, "not_found", "[articles PUT] card not found", 404, undefined, {
      userMessage: "카드를 찾을 수 없습니다.",
    });
  }

  // 권한 — ADR 0012 정합. active 명함 단위만 인정.
  //   - active 가 admin role            → 모든 카드 편집 허용
  //   - card.author_id === active.profileId → 본인이 작성한 카드 (active 명함과 일치)
  //   - active 가 의사 + 본인 doctor 카드  → 의사 본인 카드 편집 허용
  // 옛 "묶음 OR" (auth_user_id 묶음 안 어느 profile 이면 통과) 패턴 폐기.
  const isAdmin = idCtx.isSuperAdmin;
  const activeProfileId = idCtx.active.profileId;
  const isAuthor = !!card.author_id && card.author_id === activeProfileId;
  const isDoctorOfQa =
    !!idCtx.activeDoctorId && card.doctor_id === idCtx.activeDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    return errorResponse(null, "forbidden", "[articles PUT] edit denied", 403, undefined, {
      userMessage:
        "본인 글만 편집할 수 있습니다. 다른 명함으로 작성한 글은 그 명함으로 전환 후 편집해주세요.",
    });
  }

  // 페이로드 → UPDATE row 구성. undefined 인 필드는 미수정.
  const update: Record<string, unknown> = {};

  // 카테고리·type — admin/doctor 는 자유, user 는 'qa' 차단 (categoriesForRole 가 보장).
  let nextCategory: PostCategorySlug | null = null;
  if (typeof payload.category === "string") {
    if (!isPostCategorySlug(payload.category)) {
      return errorResponse(null, "invalid_input", "[articles PUT] invalid category", 400, undefined, {
        userMessage: "유효하지 않은 카테고리",
      });
    }
    const allowed = categoriesForRole(role);
    const ok = allowed.some((c) => c.slug === payload.category);
    if (!ok) {
      return errorResponse(null, "forbidden", "[articles PUT] category not allowed", 403, undefined, {
        userMessage: "이 카테고리는 사용 권한이 없습니다.",
      });
    }
    nextCategory = payload.category as PostCategorySlug;
    update.category = nextCategory;
    update.type = nextCategory === "qa" ? "qa" : "post";
  }

  if (typeof payload.title === "string") {
    const q = payload.title.trim();
    if (!q) {
      return errorResponse(null, "invalid_input", "[articles PUT] empty title", 400, undefined, {
        userMessage: "제목이 비어있습니다.",
      });
    }
    if (q.length > 200) {
      return errorResponse(null, "invalid_input", "[articles PUT] title too long", 400, undefined, {
        userMessage: "제목은 200자 이내",
      });
    }
    update.title = q;
  }
  if (typeof payload.body === "string") {
    const a = payload.body.trim();
    if (!a) {
      return errorResponse(null, "invalid_input", "[articles PUT] empty body", 400, undefined, {
        userMessage: "본문이 비어있습니다.",
      });
    }
    // 2026-05-22: 본문 한도 모든 카테고리 4000자 통일 (link 800자 폐기)
    void nextCategory; // 카테고리 무관
    const bodyMax = 4000;
    if (a.length > bodyMax) {
      return errorResponse(null, "invalid_input", "[articles PUT] body too long", 400, undefined, {
        userMessage: `본문은 최대 ${bodyMax}자까지 가능합니다.`,
      });
    }
    update.body = a;
  }

  if (Array.isArray(payload.keywords)) {
    update.keywords = payload.keywords
      .map((k) => (typeof k === "string" ? k.trim() : ""))
      .filter(Boolean)
      .slice(0, 10);
  }

  // 외부 링크 — undefined 면 미수정. null 보내면 다 비움.
  if ("external_url" in payload) {
    update.external_url = payload.external_url ?? null;
    update.external_title = payload.external_title ?? null;
    update.external_description = payload.external_description ?? null;
    update.external_image = payload.external_image ?? null;
    update.external_site_name = payload.external_site_name ?? null;
  }

  // PubMed refs (ADR 0012 — 옛 단일 pubmed_ref 폐기)
  if ("pubmed_refs" in payload) {
    update.pubmed_refs = payload.pubmed_refs ?? null;
  }

  // status 변경 — 본인 글이면 허용 (admin / 작성자 본인 / 의사 본인 doctor 글).
  // 2026-05-29 회귀 정정: 옛 가드는 `!isAdmin` 단독 (super admin only) 이었음.
  //   진입 가드 (admin/cards/[id]/edit/page.tsx) 가 `isSuperAdmin || isDoctorAdmin`
  //   둘 다 허용하는 비대칭 상태였고, 504d6ee (2026-05-28) 의 "admin EditClient →
  //   PUT 통일" 전엔 직접 `supabase.from('cards').update()` 가 cards_doctor_update
  //   / cards_owner_update RLS 로 통과해서 가려져 있었음. 통일 후 가드가 표면화
  //   되어 doctor admin 의 본인 글 발행이 차단됨 (정한미 원장 케이스).
  //   같은 라우트의 옆 줄 `is_pick` 가드 (`isAdmin || isDoctorOfQa`) 패턴과 정합.
  //   타인 글 status 변경은 여전히 차단 (isAuthor / isDoctorOfQa 는 본인 한정).
  if (payload.status !== undefined) {
    if (!isAdmin && !isAuthor && !isDoctorOfQa) {
      return errorResponse(null, "forbidden", "[articles PUT] status denied", 403, undefined, {
        userMessage: "status 변경은 관리자 또는 본인 글만 가능합니다.",
      });
    }
    if (!STATUS_SET.has(payload.status)) {
      return errorResponse(null, "invalid_input", "[articles PUT] invalid status", 400, undefined, {
        userMessage: "유효하지 않은 status",
      });
    }
    update.status = payload.status;
  }
  if (payload.is_pick !== undefined) {
    // 2026-05-22 정책: admin 또는 의사 본인 글이면 Pick 가능 (다른 의사 글 X).
    if (!(isAdmin || isDoctorOfQa)) {
      return errorResponse(null, "forbidden", "[articles PUT] is_pick denied", 403, undefined, {
        userMessage: "is_pick 변경은 관리자 또는 의사 본인 글만 가능합니다.",
      });
    }
    update.is_pick = !!payload.is_pick;
  }
  if (payload.doctor_id !== undefined) {
    if (!isAdmin) {
      return errorResponse(null, "forbidden", "[articles PUT] doctor_id admin only", 403, undefined, {
        userMessage: "doctor 변경은 admin 만 가능합니다.",
      });
    }
    update.doctor_id = payload.doctor_id;
  }
  if (payload.deleted_at !== undefined) {
    if (!isAdmin) {
      return errorResponse(null, "forbidden", "[articles PUT] deleted_at admin only", 403, undefined, {
        userMessage: "복구/삭제 상태 변경은 admin 만 가능합니다.",
      });
    }
    update.deleted_at = payload.deleted_at; // null 이면 복구
  }
  // 배치 ⑤ 6번 (2026-05-28): admin 전용 author 변경 + meta JSON 갱신.
  //   author_id: super admin 만 (옛 EditClient 와 동일 권한). 변경 시 doctor_id 도 자동 갱신은
  //   클라이언트가 별도로 payload.doctor_id 함께 보내는 것을 신뢰 (옛 동작 보존).
  //   meta: admin/doctor 가 timestamp 갱신 등에 사용. user 는 차단.
  if (payload.author_id !== undefined) {
    if (!isAdmin) {
      return errorResponse(null, "forbidden", "[articles PUT] author_id admin only", 403, undefined, {
        userMessage: "글쓴이 변경은 admin 만 가능합니다.",
      });
    }
    update.author_id = payload.author_id;
  }
  if (payload.meta !== undefined) {
    if (role === ROLES.USER) {
      return errorResponse(null, "forbidden", "[articles PUT] meta admin/doctor only", 403, undefined, {
        userMessage: "메타 변경은 admin/doctor 만 가능합니다.",
      });
    }
    update.meta = payload.meta;
  }

  // URL slug — admin edit 전용. 3중 재검증 (UI 검사를 신뢰하지 않고 서버가 최종 판정).
  //   (a) active 명함 admin  (b) 의사 글  (c) 잠금 전(status=draft)  (d) 형식  (e) 중복.
  //   검수 발송(pending_review)·발행 글은 slug 잠금 (수정 차단). DB 부분 UNIQUE 가 최후 방어선.
  if (payload.post_slug !== undefined) {
    const cardStatus = (card as { status?: string }).status ?? null;
    const cardPostYear = (card as { post_year?: number | null }).post_year ?? null;
    if (!isAdmin) {
      return errorResponse(null, "forbidden", "[articles PUT] slug admin only", 403, undefined, {
        userMessage: "URL slug 수정은 관리자만 가능합니다.",
      });
    }
    if (!card.doctor_id) {
      return errorResponse(null, "invalid_input", "[articles PUT] slug non-doctor", 400, undefined, {
        userMessage: "의사 글만 URL slug 를 가집니다.",
      });
    }
    if (cardStatus !== "draft") {
      return errorResponse(null, "invalid_input", "[articles PUT] slug locked", 409, undefined, {
        userMessage: "검수 발송/발행된 글의 URL slug 는 잠겨 있어 수정할 수 없습니다.",
      });
    }
    const s = normalizeToSlug(payload.post_slug);
    if (!isValidPostSlug(s)) {
      return errorResponse(null, "invalid_input", "[articles PUT] slug format", 400, undefined, {
        userMessage: "URL slug 형식 오류 (영문 소문자·숫자·하이픈, 2~50자).",
      });
    }
    const { data: dup } = await supabase
      .from("cards")
      .select("id")
      .eq("doctor_id", card.doctor_id)
      .eq("post_year", cardPostYear)
      .eq("post_slug", s)
      .neq("id", cardId)
      .limit(1);
    if (dup && dup.length > 0) {
      return errorResponse(null, "invalid_input", "[articles PUT] slug taken", 409, undefined, {
        userMessage: SLUG_TAKEN_MESSAGE,
      });
    }
    update.post_slug = s;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ saved: 0, message: "변경 사항 없음" });
  }

  update.updated_at = new Date().toISOString();

  // 보안 2.5차 E묶음 (2026-05-19): 본문 수정 시 자동 검수기 재실행.
  // 의사·관리자는 자동 통과. 회원이 본문 수정 시 의심 패턴 잡히면 status 강제 변경.
  // admin 이 명시적으로 status 지정한 경우엔 그것을 존중 (덮어쓰지 않음).
  //
  // 2026-05-28 (P1-②): silent fail 방지 — verdict 를 상위 scope 으로 끌어올려
  // 응답에 screening 필드 포함. 클라이언트(EditClient) 가 사용자에게 토스트 안내.
  let screeningFlagged = false;
  let screeningReasons: string[] = [];
  if (role === ROLES.USER && (update.title || update.body)) {
    const verdict = screenContent({
      title: (update.title as string | null) ?? null,
      body: (update.body as string | null) ?? null,
      keywords: (update.keywords as string[] | null) ?? null,
      externalUrl: (update.external_url as string | null) ?? null,
      authorRole: "user",
    });
    if (verdict.flagged) {
      update.status = "pending_review";
      update.screening_flags = verdict.reasons;
      screeningFlagged = true;
      screeningReasons = verdict.reasons;
    } else {
      // 의심 해소된 경우 flags 정리
      update.screening_flags = null;
    }
  }

  // 의료 검토일(SSOT) 기록 — 마이그레이션 0196 신설 `cards.reviewed_at`.
  // 정책: Q&A 카드(type='qa')를 사람(의사/관리자/작성자)이 손으로 편집·발행해
  //   이번 수정 결과 최종 status 가 'published' 가 되는 경우 = 검수 확정 시각.
  //   "한 글자만 고쳐도 검토를 확정한 것" 정책.
  // 위치 주의: 반드시 screening 강제 전환 로직 *이후*. screening 으로
  //   status 가 'pending_review' 로 강제되면 아래 조건(=== 'published')에서 자연히 제외됨.
  // post 카드(type='post')는 어떤 경우에도 reviewed_at 을 건드리지 않음 (NULL 유지).
  // 최종 type 판정: 이번 수정에서 category 변경으로 type 이 바뀌면 update.type 을, 아니면 기존 card.type 을 사용.
  const finalType =
    (update.type as string | undefined) ?? (card.type as string | null);
  if (finalType === "qa" && update.status === "published") {
    update.reviewed_at = new Date().toISOString();
  }

  const { error: updErr } = await supabase
    .from("cards")
    .update(update)
    .eq("id", cardId);
  if (updErr) {
    if (isSlugUniqueViolation(updErr)) {
      return errorResponse(updErr, "invalid_input", "[articles PUT] slug unique", 409, undefined, {
        userMessage: SLUG_TAKEN_MESSAGE,
      });
    }
    return errorResponse(updErr, "generic", "[articles PUT] update", 500);
  }

  // P1-⑤ (2026-05-28): 검수에 의해 status='pending_review' 강제된 회원 글 수정은 audit 적재.
  // admin 명시 status 변경은 아래 card.admin_update 가 별도로 잡음 (중복 회피).
  if (screeningFlagged) {
    await logAudit({
      action: "card.status_change",
      actorProfileId: activeProfileId,
      actorAuthUserId: user.id,
      targetTable: "cards",
      targetId: cardId,
      request: req,
      metadata: {
        from_status: "(edit)",
        to_status: "pending_review",
        cause: "screening_auto",
        reasons: screeningReasons,
      },
    });
  }

  // PIPA 안전성 확보조치 §8: admin 의 카드 admin-only 필드 변경은 audit.
  // 분쟁 추적 핵심 (status hidden 처리·soft-delete·is_pick·doctor 재배정 등).
  // is_pick 은 의사 본인 가능이라 isAdmin 으로 좁힘.
  if (isAdmin) {
    const adminChanges: Record<string, unknown> = {};
    if (payload.status !== undefined) adminChanges.status = update.status;
    if (payload.deleted_at !== undefined) adminChanges.deleted_at = update.deleted_at;
    if (payload.is_pick !== undefined) adminChanges.is_pick = update.is_pick;
    if (payload.doctor_id !== undefined) adminChanges.doctor_id = update.doctor_id;
    if (payload.author_id !== undefined) adminChanges.author_id = update.author_id;
    if (Object.keys(adminChanges).length > 0) {
      await logAudit({
        action: "card.admin_update",
        actorProfileId: activeProfileId,
        actorAuthUserId: user.id,
        targetTable: "cards",
        targetId: cardId,
        request: req,
        metadata: adminChanges,
      });
    }
  }

  // SEO·피드 정적 캐시 무효화 — 카드 viewer URL 과 doctor·handle 페이지.
  // 너무 좁게 짚지 말고 광범위 revalidate.
  try {
    revalidatePath("/", "layout");
  } catch {
    /* revalidate 실패는 무시 — 다음 dynamic 요청에 자동 갱신됨 */
  }

  return NextResponse.json({
    saved: 1,
    cardId,
    // P1-② (2026-05-28): silent fail 방지 — 검수에 걸려 pending_review 로 전환되면
    // 클라이언트가 사용자에게 토스트 1회 노출 (POST 측 응답과 동일 구조).
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
