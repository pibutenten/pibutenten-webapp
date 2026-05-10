import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { makeArticleSlug } from "@/lib/article/slug";
import type { ArticleSection } from "@/lib/article/types";
import { readPersonaServer } from "@/lib/persona-server";
import {
  buildSlug,
  resolveSlugCollision,
} from "@/data/procedure-mappings/slug-mapping";

export const dynamic = "force-dynamic";

type WriteType = "post" | "article" | "qa";

type SubmitStatus = "draft" | "pending_review" | "published";

type Payload = {
  type: WriteType;
  /** 글 분류 카테고리 (Phase 2) — review/daily/question/news/qa. 미입력 시 type 기반 자동 매핑 */
  category?: string;
  status?: SubmitStatus; // 기본 'published'
  // post: title + body 통일 (Q&A와 동일 구조)
  title?: string;
  body?: string;
  // article 전용
  cover_image?: string | null;
  sections?: ArticleSection[];
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
 * - type='article' : 원장/관리자 칼럼. 즉시 published.
 * - type='qa' : 관리자가 특정 원장 명의로 작성. status='pending_review'.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "프로필을 찾을 수 없습니다." }, { status: 403 });
  }
  const role = (profile.role ?? "user") as "admin" | "doctor" | "user";

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }
  const t = payload.type;
  if (t !== "post" && t !== "article" && t !== "qa") {
    return NextResponse.json({ error: "유효하지 않은 type" }, { status: 400 });
  }

  // 권한 검증
  if (t === "article" && role !== "doctor" && role !== "admin") {
    return NextResponse.json(
      { error: "칼럼은 원장 또는 관리자만 작성 가능합니다." },
      { status: 403 },
    );
  }
  if (t === "qa" && role !== "admin") {
    return NextResponse.json(
      { error: "Q&A는 관리자만 직접 작성 가능합니다." },
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
  } else if (t === "article" && role === "doctor") {
    // 원장 자신의 doctor_id
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!da?.doctor_id) {
      return NextResponse.json(
        { error: "원장 매핑이 없습니다. 관리자에게 문의해주세요." },
        { status: 400 },
      );
    }
    doctorId = da.doctor_id;
  } else if (t === "article" && role === "admin") {
    // 관리자가 칼럼 작성 시 본인을 author_id로 두되 doctor_id는 선택 가능 (선택값 없으면 null)
    const slug = (payload.doctor_slug ?? "").trim();
    if (slug) {
      const { data: d } = await supabase
        .from("doctors")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (d) doctorId = d.id;
    }
  }
  // post는 doctor_id null

  // 페르소나 컨텍스트 — post는 페르소나 따라 official/personal, qa·article은 항상 official
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
        .from("qas")
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
  // v3 spec 6 카테고리: qa/tip/diary/ask/news/share
  const VALID_CATEGORIES = ["qa", "tip", "diary", "ask", "news"];
  let category: string;
  if (payload.category && VALID_CATEGORIES.includes(payload.category)) {
    category = payload.category;
  } else {
    category = t === "qa" ? "qa" : t === "article" ? "tip" : "diary";
  }

  // v4: 카테고리 라벨은 카드 헤더(닉네임 밑)에 표시되므로 keywords에 별도 prepend 안 함.
  // 사용자가 카테고리 라벨을 keywords에 직접 입력했으면 중복 방지로 제거.
  // 옛 라벨(Q&A/꿀팁/물어봐요)과 새 라벨(답해드려요/피부꿀팁/궁금해요) 모두 제거
  const CATEGORY_LABELS_TO_STRIP = [
    "Q&A",
    "답해드려요",
    "꿀팁",
    "피부꿀팁",
    "피부일기",
    "물어봐요",
    "궁금해요",
    "새소식",
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
        .from("qas")
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

  // 본문 검증 + insert payload 구성
  const insert: Record<string, unknown> = {
    type: t,
    category,
    author_id: user.id,
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
  } else if (t === "article") {
    const title = (payload.title ?? "").trim();
    const sections = (payload.sections ?? []).filter(
      (s) => s && (s.heading?.trim() || s.body?.trim()),
    );
    if (!title) {
      return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
    }
    if (sections.length === 0) {
      return NextResponse.json(
        { error: "섹션을 1개 이상 입력해주세요." },
        { status: 400 },
      );
    }
    insert.question = title;
    insert.answer = sections
      .map((s) => `${s.heading ?? ""}\n${s.body ?? ""}`)
      .join("\n\n");
    insert.article_sections = sections;
    insert.article_cover_image = (payload.cover_image ?? "").trim() || null;
    insert.article_slug = makeArticleSlug(title);
    insert.status = "published";
    insert.doctor_id = doctorId;
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
    insert.status = "pending_review";
    insert.doctor_id = doctorId;
  }

  const { data: row, error: insErr } = await supabase
    .from("qas")
    .insert(insert)
    .select("id, type, article_slug, status, post_slug, post_year, shortcode")
    .single();

  if (insErr) {
    return NextResponse.json(
      { error: `저장 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: row.id,
    type: row.type,
    status: row.status,
    article_slug: row.article_slug,
    post_slug: row.post_slug,
    post_year: row.post_year,
    shortcode: row.shortcode,
  });
}
