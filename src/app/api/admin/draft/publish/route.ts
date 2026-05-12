/**
 * POST /api/admin/draft/publish
 *
 * Phase 8 위저드 Step3 — 검수 완료된 카드 N개를 qas INSERT + 발행.
 *
 * 입력: {
 *   videoId: string,
 *   videoTitle: string,
 *   cards: [{
 *     question, answer, keywords[], category,
 *     doctorSlug,              // 카드별 화자
 *     externalUrl,             // 시작 시각 포함
 *     externalTitle,
 *     externalImage,           // 안 주면 자동 (i.ytimg.com/.../hqdefault.jpg)
 *     timestampStartSec,
 *     scriptEvidence,
 *     pubmedRef: {...} | null,
 *     pubmedReasoning: string
 *   }]
 *   status?: 'draft' | 'pending_review' | 'published'  (기본 published)
 * }
 *
 * 출력: { saved: number, ids: number[] }
 *
 * NOTE: video 테이블은 안 건드림 (Phase 8 결정 — 카드별 external_*로 독립).
 * shortcode·post_year·post_slug는 카드별 자동 생성.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateShortcode } from "@/lib/shortcode";
import { normalizeTags } from "@/lib/tag-dictionary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CardIn = {
  question: string;
  answer: string;
  keywords: string[];
  category?: string | null;
  doctorSlug: string;
  externalUrl: string;
  externalTitle: string;
  externalImage?: string;
  timestampStartSec?: number;
  scriptEvidence?: string;
  pubmedRef?: Record<string, unknown> | null;
  pubmedReasoning?: string;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: admin only" },
      { status: 403 },
    );
  }

  let body: {
    videoId?: unknown;
    videoTitle?: unknown;
    cards?: unknown;
    status?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const videoId = typeof body.videoId === "string" ? body.videoId : "";
  const videoTitle = typeof body.videoTitle === "string" ? body.videoTitle : "";
  const status =
    body.status === "draft" ||
    body.status === "pending_review" ||
    body.status === "published"
      ? body.status
      : "published";
  if (!videoId || !Array.isArray(body.cards)) {
    return NextResponse.json(
      { error: "videoId, cards[] required" },
      { status: 400 },
    );
  }
  const cards = body.cards as CardIn[];
  if (cards.length === 0) {
    return NextResponse.json({ error: "cards is empty" }, { status: 400 });
  }

  // doctor_slug → doctor_id 매핑
  const { data: doctorsData } = await supabase
    .from("doctors")
    .select("id, slug");
  const slugToId = new Map<string, string>(
    (doctorsData ?? []).map((d) => [d.slug, d.id]),
  );

  const now = new Date();
  const postYear = now.getFullYear();
  const yyyymmdd = now.toISOString().slice(0, 10);

  // 카드별 row 생성
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const q = (c.question ?? "").trim();
    const a = (c.answer ?? "").trim();
    if (!q || !a) {
      return NextResponse.json(
        { error: `card #${i + 1}: question/answer 비어있음` },
        { status: 400 },
      );
    }
    const doctorId = slugToId.get(c.doctorSlug);
    if (!doctorId) {
      return NextResponse.json(
        { error: `card #${i + 1}: doctor not found for slug ${c.doctorSlug}` },
        { status: 400 },
      );
    }

    const externalImage =
      c.externalImage || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // meta jsonb — Phase 7과 같은 형태 (timestamp, script_evidence, card_category, reasoning)
    const metaObj: Record<string, unknown> = {
      video_id: videoId,
      video_title: videoTitle,
      source_file: `${videoId}.ko.vtt`,
      timestamp: {
        start: formatMMSS(c.timestampStartSec ?? 0),
        start_seconds: c.timestampStartSec ?? 0,
      },
      script_evidence: c.scriptEvidence ?? "",
      card_category: c.category ?? "",
      reasoning: c.pubmedReasoning ?? "",
    };

    // post_slug: 회원 글 shortcode 룰을 빌려 8자 base58 사용 (충돌 방지). 운영 카드는 보통 post_year/post_slug로 URL 생성.
    const postSlug = `${videoId}-${i + 1}`.slice(0, 80);
    const shortcode = generateShortcode();

    rows.push({
      doctor_id: doctorId,
      type: "qa",
      category: "qa",
      status,
      published: status === "published",
      is_pick: false,
      question: q,
      answer: a,
      keywords: normalizeTags(c.keywords ?? []),
      post_year: postYear,
      post_slug: postSlug,
      shortcode,
      external_url: c.externalUrl || `https://youtu.be/${videoId}`,
      external_title: c.externalTitle || videoTitle,
      external_image: externalImage,
      external_site_name: "YouTube",
      pubmed_ref: c.pubmedRef ?? null,
      meta: JSON.stringify(metaObj),
      author_id: user.id,
      created_at: `${yyyymmdd} 00:00:00+09`,
      updated_at: now.toISOString(),
    });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("qas")
    .insert(rows)
    .select("id");
  if (insErr) {
    return NextResponse.json(
      { error: `qas insert 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      saved: inserted?.length ?? 0,
      ids: (inserted ?? []).map((r) => r.id),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
