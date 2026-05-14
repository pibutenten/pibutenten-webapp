/**
 * POST /api/admin/draft/publish
 *
 * Phase 8 위저드 Step3 — 검수 완료된 카드 N개를 cards INSERT + 발행.
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
 * 출력: { saved: number, ids: number[], videoRowId: number }
 *
 * 영상 정보:
 *   - `videos` 테이블에 `youtube_id` 기준 UPSERT (없으면 INSERT, 있으면 갱신)
 *   - 모든 카드의 `cards.video_id`에 그 videos.id 채움
 *   - 외부 카드 형식(external_url 등)도 동시에 유지 (이전 호환)
 * shortcode·post_year·post_slug는 카드별 자동 생성.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
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
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const supabase = await createSupabaseServerClient();

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

  // doctor_id → profile_id 매핑 (검수→발행 시 author = 원장님 profile).
  // doctor_accounts에 매핑 없으면 admin profile_id로 fallback.
  const { data: doctorAccounts } = await supabase
    .from("doctor_accounts")
    .select("doctor_id, profile_id");
  const doctorIdToProfileId = new Map<string, string>(
    (doctorAccounts ?? []).map((r) => [
      (r as { doctor_id: string }).doctor_id,
      (r as { profile_id: string }).profile_id,
    ]),
  );

  // videos UPSERT — youtube_id 기준. 모든 cards.video_id에 이 row.id 채움.
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { data: videoRow, error: vidErr } = await supabase
    .from("videos")
    .upsert(
      {
        youtube_id: videoId,
        youtube_url: youtubeUrl,
        topic: videoTitle || null,
      },
      { onConflict: "youtube_id" },
    )
    .select("id")
    .single();
  if (vidErr || !videoRow) {
    return NextResponse.json(
      { error: `videos upsert 실패: ${vidErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const videoRowId = videoRow.id as number;

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
      video_id: videoRowId, // ← videos.id 필수 채움 (single source)
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
      // author = 검수받을 원장님의 profile_id. 매핑 없으면 admin profile_id fallback.
      // (auth.users.id 가 아니라 profiles.id 사용 — Phase 9 FK 정합성)
      author_id:
        doctorIdToProfileId.get(doctorId) ?? guard.adminProfileId,
      created_at: `${yyyymmdd} 00:00:00+09`,
      updated_at: now.toISOString(),
    });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("cards")
    .insert(rows)
    .select("id");
  if (insErr) {
    return NextResponse.json(
      { error: `cards insert 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      saved: inserted?.length ?? 0,
      ids: (inserted ?? []).map((r) => r.id),
      videoRowId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
