import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { makeArticleSlug } from "@/lib/article/slug";
import type { ArticleSection } from "@/lib/article/types";

export const dynamic = "force-dynamic";

type WriteType = "post" | "article" | "qa";

type Payload = {
  type: WriteType;
  // post
  body?: string;
  // article
  title?: string;
  cover_image?: string | null;
  sections?: ArticleSection[];
  // qa (admin)
  doctor_slug?: string;
  question?: string;
  answer?: string;
  // shared
  keywords?: string[];
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

  // 본문 검증 + insert payload 구성
  const insert: Record<string, unknown> = {
    type: t,
    author_id: user.id,
    keywords,
  };

  if (t === "post") {
    const body = (payload.body ?? "").trim();
    if (!body) {
      return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
    }
    if (body.length > 4000) {
      return NextResponse.json(
        { error: "post는 최대 4000자까지 가능합니다." },
        { status: 400 },
      );
    }
    insert.question = body.slice(0, 80); // 첫 80자 제목 자리
    insert.answer = body;
    insert.status = "published";
    insert.doctor_id = null;
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
    .select("id, type, article_slug, status")
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
  });
}
