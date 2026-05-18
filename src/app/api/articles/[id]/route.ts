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
 *   - pubmed_ref (단일), pubmed_refs (배열)
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
import { bundleProfileFilter } from "@/lib/identity-shared";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import {
  categoriesForRole,
  isPostCategorySlug,
  type PostCategorySlug,
} from "@/lib/post-category";

export const dynamic = "force-dynamic";

type Status = "draft" | "pending_review" | "published" | "archived";

type PubmedRefObj = {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
} | null;

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
  pubmed_ref?: PubmedRefObj;
  pubmed_refs?: NonNullable<PubmedRefObj>[] | null;
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
    return NextResponse.json({ error: "유효하지 않은 카드 id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
  }

  // 권한 — POST /api/articles 와 같은 패턴 (active identity 기준).
  // 묶음 인지 isAuthor: card.author_id 가 user 묶음 안 어느 profile 이면 통과.
  const { data: myProfiles } = await supabase
    .from("profiles")
    .select("id")
    .or(bundleProfileFilter(user.id));
  const myProfileIds = new Set((myProfiles ?? []).map((p) => p.id as string));

  const isAdmin = idCtx.isSuperAdmin;
  const isAuthor = !!card.author_id && myProfileIds.has(card.author_id);
  const isDoctorOfQa =
    !!idCtx.activeDoctorId && card.doctor_id === idCtx.activeDoctorId;
  const canEdit = isAdmin || isAuthor || isDoctorOfQa;
  if (!canEdit) {
    return NextResponse.json(
      { error: "본인 글만 편집할 수 있습니다." },
      { status: 403 },
    );
  }

  // 페이로드 → UPDATE row 구성. undefined 인 필드는 미수정.
  const update: Record<string, unknown> = {};

  // 카테고리·type — admin/doctor 는 자유, user 는 'qa' 차단 (categoriesForRole 가 보장).
  let nextCategory: PostCategorySlug | null = null;
  if (typeof payload.category === "string") {
    if (!isPostCategorySlug(payload.category)) {
      return NextResponse.json(
        { error: "유효하지 않은 카테고리" },
        { status: 400 },
      );
    }
    const allowed = categoriesForRole(role);
    const ok = allowed.some((c) => c.slug === payload.category);
    if (!ok) {
      return NextResponse.json(
        { error: "이 카테고리는 사용 권한이 없습니다." },
        { status: 403 },
      );
    }
    nextCategory = payload.category as PostCategorySlug;
    update.category = nextCategory;
    update.type = nextCategory === "qa" ? "qa" : "post";
  }

  if (typeof payload.question === "string") {
    const q = payload.question.trim();
    if (!q) {
      return NextResponse.json({ error: "제목/질문이 비어있습니다." }, { status: 400 });
    }
    if (q.length > 200) {
      return NextResponse.json({ error: "제목은 200자 이내" }, { status: 400 });
    }
    update.question = q;
  }
  if (typeof payload.answer === "string") {
    const a = payload.answer.trim();
    if (!a) {
      return NextResponse.json({ error: "본문/답변이 비어있습니다." }, { status: 400 });
    }
    // 본문 한도 — link 카테고리 800, 그 외 admin 카드는 4000 까지 허용 (admin EditClient 도 4000).
    const effectiveCategory =
      nextCategory ?? (card.category as PostCategorySlug | null);
    const bodyMax = effectiveCategory === "link" ? 800 : 4000;
    if (a.length > bodyMax) {
      return NextResponse.json(
        { error: `본문은 최대 ${bodyMax}자까지 가능합니다.` },
        { status: 400 },
      );
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

  // PubMed refs
  if ("pubmed_refs" in payload) {
    update.pubmed_refs = payload.pubmed_refs ?? null;
  }
  if ("pubmed_ref" in payload) {
    update.pubmed_ref = payload.pubmed_ref ?? null;
  }

  // admin 전용 필드
  if (payload.status !== undefined) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "status 변경은 admin 만 가능합니다." },
        { status: 403 },
      );
    }
    if (!STATUS_SET.has(payload.status)) {
      return NextResponse.json({ error: "유효하지 않은 status" }, { status: 400 });
    }
    update.status = payload.status;
  }
  if (payload.is_pick !== undefined) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "is_pick 변경은 admin 만 가능합니다." },
        { status: 403 },
      );
    }
    update.is_pick = !!payload.is_pick;
  }
  if (payload.doctor_id !== undefined) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "doctor 변경은 admin 만 가능합니다." },
        { status: 403 },
      );
    }
    update.doctor_id = payload.doctor_id;
  }
  if (payload.deleted_at !== undefined) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "복구/삭제 상태 변경은 admin 만 가능합니다." },
        { status: 403 },
      );
    }
    update.deleted_at = payload.deleted_at; // null 이면 복구
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ saved: 0, message: "변경 사항 없음" });
  }

  update.updated_at = new Date().toISOString();

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
