import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readPersonaServer } from "@/lib/persona-server";
import { getIdentityContext } from "@/lib/identity";
import {
  buildSlug,
  resolveSlugCollision,
} from "@/data/procedure-mappings/slug-mapping";

export const dynamic = "force-dynamic";

// post / qa 만 지원
type WriteType = "post" | "qa";

type SubmitStatus = "draft" | "pending_review" | "published";

type Payload = {
  type: WriteType;
  /** 글 분류 카테고리 (Phase 2) — review/daily/question/news/qa. 미입력 시 type 기반 자동 매핑 */
  category?: string;
  status?: SubmitStatus; // 기본 'published'
  // post: title + body 통일 (Q&A와 동일 구조)
  title?: string;
  body?: string;
  // qa
  doctor_slug?: string;
  question?: string;
  answer?: string;
  // shared
  keywords?: string[];
  // 외부 링크 (Phase 3) — 모든 카테고리에서 옵션
  external_url?: string;
  external_meta?: {
    title?: string;
    description?: string;
    image?: string | null;
    siteName?: string;
  };
  /** 의사 직함 숨김 — Phase A.2. 사적 모드 카테고리 default true */
  hide_doctor_credential?: boolean;
};

/**
 * POST /api/articles
 *
 * 글쓰기 통합 엔드포인트.
 * - type='post' : 일반 글 (모든 로그인 유저). 즉시 published.
 * - type='qa' : 관리자/원장이 작성. status='pending_review'.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  // Phase 9: active identity 기반 — 묶음 내 ID 전환 시 글의 author도 그 profile로 저장.
  // 구 버그: user.id (= base auth.users.id) 만 사용해 항상 base profile(보통 의사)로 저장 →
  //   회원 모드로 작성한 글이 의사 핸들 슬러그(/bae-jungmin/...)로 노출되는 문제.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const user = idCtx.user;
  // role은 active identity 기준 (회원 ID로 전환 중이면 'user', 의사 ID면 'doctor')
  const role = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }
  const t = payload.type;
  if (t !== "post" && t !== "qa") {
    return NextResponse.json({ error: "유효하지 않은 type" }, { status: 400 });
  }

  // 권한 검증 — v5.1: Q&A는 원장·관리자만 작성 가능
  if (t === "qa" && role !== "admin" && role !== "doctor") {
    return NextResponse.json(
      { error: "Q&A는 원장 또는 관리자만 작성 가능합니다." },
      { status: 403 },
    );
  }

  // status 결정 — 클라이언트가 보낸 값 검증
  const reqStatus: SubmitStatus = payload.status ?? "published";
  if (
    reqStatus !== "draft" &&
    reqStatus !== "pending_review" &&
    reqStatus !== "published"
  ) {
    return NextResponse.json({ error: "유효하지 않은 status" }, { status: 400 });
  }
  // pending_review는 admin이 원장 명의로 작성할 때만 의미 있음
  if (reqStatus === "pending_review" && role !== "admin") {
    return NextResponse.json(
      { error: "검수 요청 권한이 없습니다." },
      { status: 403 },
    );
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
      return NextResponse.json({ error: "원장을 선택해주세요." }, { status: 400 });
    }
    const { data: d } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!d) {
      return NextResponse.json({ error: "원장을 찾을 수 없습니다." }, { status: 400 });
    }
    doctorId = d.id;
  }
  // post는 doctor_id null

  // 페르소나 컨텍스트 — post는 페르소나 따라 official/personal, qa는 항상 official
  const currentPersona = await readPersonaServer();

  // ── post_slug + post_year 자동 생성 (§2 SEO URL 정책) ─────────────
  // post_year: 발행 연도 (서버 기준, KST 무관 — DB에서 EXTRACT YEAR로 동일 결과)
  const postYear = new Date().getUTCFullYear();
  // post_slug: 태그 첫 3개만 결합 + 50자 초과 시 단어 경계에서 자르기.
  //  → URL 가독성 + Twitter/카톡 미리보기 잘림 방지.
  // 같은 의사·연도 내 충돌 시 -2/-3 부여.
  const SLUG_MAX_KEYWORDS = 3;
  const SLUG_MAX_LEN = 50;
  let postSlug: string | null = null;
  if (doctorId && keywords.length > 0) {
    const slugTags = keywords.slice(0, SLUG_MAX_KEYWORDS);
    let baseSlug = buildSlug(slugTags);
    if (baseSlug && !baseSlug.startsWith("untagged-")) {
      if (baseSlug.length > SLUG_MAX_LEN) {
        const cut = baseSlug.slice(0, SLUG_MAX_LEN);
        const lastDash = cut.lastIndexOf("-");
        baseSlug = lastDash > 5 ? cut.slice(0, lastDash) : cut;
      }
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

  // 카테고리 결정 — payload.category 우선, 없으면 type에서 자동 매핑.
  // v5.1+: 5개 카테고리 qa/tip/diary/ask/link (share → link 슬러그 변경, 라벨 '공유하기' 유지)
  const VALID_CATEGORIES = ["qa", "tip", "diary", "ask", "link"];
  let category: string;
  if (payload.category && VALID_CATEGORIES.includes(payload.category)) {
    category = payload.category;
  } else {
    category = t === "qa" ? "qa" : "diary";
  }
  // user role은 category='qa' 사용 불가 (type=post + category=qa 우회 차단)
  if (category === "qa" && role !== "admin" && role !== "doctor") {
    return NextResponse.json(
      { error: "Q&A 카테고리는 원장 또는 관리자만 작성 가능합니다." },
      { status: 403 },
    );
  }

  // v5.1: 카테고리 라벨은 카드 헤더(닉네임 밑) + 태그 칩 끝에 자동 표시.
  // 사용자가 카테고리 라벨을 keywords에 직접 입력했으면 중복 방지로 제거.
  // 옛 라벨(답해드려요/새소식 등)과 새 라벨(Q&A/공유하기) 모두 제거
  const CATEGORY_LABELS_TO_STRIP = [
    "Q&A",
    "답해드려요",
    "꿀팁",
    "피부꿀팁",
    "피부일기",
    "물어봐요",
    "궁금해요",
    "새소식",
    "공유하기",
  ];
  const filteredKeywords = keywords.filter(
    (k) => !CATEGORY_LABELS_TO_STRIP.includes(k),
  );
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

  // shortcode 생성 — 회원 글(post) 또는 의사 personal post 일 때.
  // doctor official 글(doctorId + post_slug 모두 있음)은 keyword slug를 쓰므로 shortcode 불필요.
  // 충돌 시 최대 5회 재시도 (8자 base58 = ~128조 조합으로 사실상 충돌 0).
  let shortcode: string | null = null;
  const isDoctorOfficial =
    t === "qa" || (t === "post" && doctorId && currentPersona === "official");
  if (t === "post" && !isDoctorOfficial) {
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
      return NextResponse.json(
        { error: "shortcode 생성 실패 — 잠시 후 다시 시도해주세요." },
        { status: 500 },
      );
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
      return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: "본문을 입력해주세요." }, { status: 400 });
    }
    if (body.length > 4000) {
      return NextResponse.json(
        { error: "본문은 최대 4000자까지 가능합니다." },
        { status: 400 },
      );
    }
    insert.question = title;
    insert.answer = body;
    insert.status = reqStatus;
    insert.published = reqStatus === "published";
    insert.posted_as = currentPersona;
    // doctor_id — 공식 모드에서만 매핑된 doctor 페이지에 노출
    insert.doctor_id = currentPersona === "official" ? doctorId : null;
  } else if (t === "qa") {
    const q = (payload.question ?? "").trim();
    const a = (payload.answer ?? "").trim();
    if (!q || !a) {
      return NextResponse.json(
        { error: "질문과 답변을 모두 입력해주세요." },
        { status: 400 },
      );
    }
    insert.question = q;
    insert.answer = a;
    // 클라이언트가 보낸 status 존중 (draft/pending_review/published).
    // 이전 버그: status를 항상 pending_review로 강제 덮어써서 "저장"(draft) 버튼이 검수 큐로 직행함.
    insert.status = reqStatus;
    insert.published = reqStatus === "published";
    insert.posted_as = currentPersona;
    insert.doctor_id = doctorId;
  }

  const { data: row, error: insErr } = await supabase
    .from("cards")
    .insert(insert)
    .select("id, type, status, post_slug, post_year, shortcode")
    .single();

  if (insErr) {
    return NextResponse.json(
      { error: `저장 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  // 캐시 무효화 — 대시보드 KPI/카드 목록/회원 프로필 즉시 갱신.
  // (point-in-time 카운트는 매번 fresh fetch지만, Next.js RSC payload 캐시·full route cache 모두 무효화)
  try {
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
  });
}
