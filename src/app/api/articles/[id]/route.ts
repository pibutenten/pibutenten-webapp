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
 *   - question, answer, keywords
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

export const dynamic = "force-dynamic";

type Status = "draft" | "pending_review" | "published" | "archived";

type Payload = {
  question?: string;
  answer?: string;
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
};

const STATUS_SET = new Set<Status>([
  "draft",
  "pending_review",
  "published",
  "archived",
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
    .select("id, type, category, author_id, doctor_id, deleted_at")
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

  if (typeof payload.question === "string") {
    const q = payload.question.trim();
    if (!q) {
      return errorResponse(null, "invalid_input", "[articles PUT] empty question", 400, undefined, {
        userMessage: "제목/질문이 비어있습니다.",
      });
    }
    if (q.length > 200) {
      return errorResponse(null, "invalid_input", "[articles PUT] question too long", 400, undefined, {
        userMessage: "제목은 200자 이내",
      });
    }
    update.question = q;
  }
  if (typeof payload.answer === "string") {
    const a = payload.answer.trim();
    if (!a) {
      return errorResponse(null, "invalid_input", "[articles PUT] empty answer", 400, undefined, {
        userMessage: "본문/답변이 비어있습니다.",
      });
    }
    // 2026-05-22: 본문 한도 모든 카테고리 4000자 통일 (link 800자 폐기)
    void nextCategory; // 카테고리 무관
    const bodyMax = 4000;
    if (a.length > bodyMax) {
      return errorResponse(null, "invalid_input", "[articles PUT] answer too long", 400, undefined, {
        userMessage: `본문은 최대 ${bodyMax}자까지 가능합니다.`,
      });
    }
    update.answer = a;
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

  // admin 전용 필드
  if (payload.status !== undefined) {
    if (!isAdmin) {
      return errorResponse(null, "forbidden", "[articles PUT] status admin only", 403, undefined, {
        userMessage: "status 변경은 admin 만 가능합니다.",
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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ saved: 0, message: "변경 사항 없음" });
  }

  update.updated_at = new Date().toISOString();

  // 보안 2.5차 E묶음 (2026-05-19): 본문 수정 시 자동 검수기 재실행.
  // 의사·관리자는 자동 통과. 회원이 본문 수정 시 의심 패턴 잡히면 status 강제 변경.
  // admin 이 명시적으로 status 지정한 경우엔 그것을 존중 (덮어쓰지 않음).
  if (role === "user" && (update.question || update.answer)) {
    const verdict = screenContent({
      title: (update.question as string | null) ?? null,
      body: (update.answer as string | null) ?? null,
      question: (update.question as string | null) ?? null,
      answer: (update.answer as string | null) ?? null,
      keywords: (update.keywords as string[] | null) ?? null,
      externalUrl: (update.external_url as string | null) ?? null,
      authorRole: "user",
    });
    if (verdict.flagged) {
      update.status = "pending_review";
      update.screening_flags = verdict.reasons;
    } else {
      // 의심 해소된 경우 flags 정리
      update.screening_flags = null;
    }
  }

  const { error: updErr } = await supabase
    .from("cards")
    .update(update)
    .eq("id", cardId);
  if (updErr) {
    return errorResponse(updErr, "generic", "[articles PUT] update", 500);
  }

  // SEO·피드 정적 캐시 무효화 — 카드 viewer URL 과 doctor·handle 페이지.
  // 너무 좁게 짚지 말고 광범위 revalidate.
  try {
    revalidatePath("/", "layout");
  } catch {
    /* revalidate 실패는 무시 — 다음 dynamic 요청에 자동 갱신됨 */
  }

  return NextResponse.json({ saved: 1, cardId });
}
