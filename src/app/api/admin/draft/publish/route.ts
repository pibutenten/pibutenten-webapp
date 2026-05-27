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
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";

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

  // PR-B E6: 대량 카드 INSERT 폭주 방어. admin 당 분당 5회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-draft-publish",
    userId: guard.userId,
    max: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();

  let body: {
    videoId?: unknown;
    videoTitle?: unknown;
    cards?: unknown;
    status?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/draft/publish] body parse", 400, undefined, { userMessage: "Invalid JSON body" });
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
    return errorResponse(null, "invalid_input", "[admin/draft/publish] videoId/cards required", 400, undefined, { userMessage: "videoId, cards[] required" });
  }
  const cards = body.cards as CardIn[];
  if (cards.length === 0) {
    return errorResponse(null, "invalid_input", "[admin/draft/publish] cards empty", 400, undefined, { userMessage: "cards is empty" });
  }

  // doctor_slug → doctor_id 매핑
  const { data: doctorsData } = await supabase
    .from("doctors")
    .select("id, slug");
  const slugToId = new Map<string, string>(
    (doctorsData ?? []).map((d) => [d.slug, d.id]),
  );

  // doctor_id → profile_id 매핑 (검수→발행 시 author = 원장님 profile).
  // SSOT (profiles.doctor_id) 기준 역조회. 매핑 없으면 admin profile_id 로 fallback.
  const { data: mappedProfiles } = await supabase
    .from("profiles")
    .select("id, doctor_id")
    .not("doctor_id", "is", null);
  const doctorIdToProfileId = new Map<string, string>(
    (mappedProfiles ?? []).map((r) => [
      (r as { doctor_id: string }).doctor_id,
      (r as { id: string }).id,
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
    return errorResponse(vidErr, "save_failed", "[admin/draft/publish] videos upsert", 500);
  }
  const videoRowId = videoRow.id as number;

  // Dedup 검사 — 같은 video_id 에 이미 발행된 카드 있는지 (260518, soft-delete 도입과 함께).
  // 같은 영상 두 번째 분석·publish 시 중복 카드 생성 차단 (김종식 원장 케이스 회귀 방지).
  // 매칭 기준: 동일 video_id + (start_seconds 동일 OR 정규화된 question prefix 20자 일치).
  // 매칭된 후보 카드는 자동 skip 하고 응답에 skipped 목록 반환.
  const { data: existingCards } = await supabase
    .from("cards")
    .select("id, question, meta")
    .eq("video_id", videoRowId)
    .is("deleted_at", null);

  function normalizeQ(s: string): string {
    return (s || "")
      .replace(/\s+/g, "")
      .replace(/[?!.,~·:\u200b"'()]/g, "")
      .toLowerCase();
  }
  const existingFingerprints = new Set<string>();
  const existingPrefixes = new Set<string>();
  for (const row of existingCards ?? []) {
    const meta =
      typeof row.meta === "string" ? JSON.parse(row.meta || "{}") : row.meta;
    const startSec =
      meta?.timestamp?.start_seconds ?? meta?.timestamp?.startSeconds ?? null;
    const qNorm = normalizeQ(row.question as string);
    if (startSec !== null) {
      existingFingerprints.add(`${startSec}:${qNorm.slice(0, 12)}`);
    }
    if (qNorm.length >= 15) existingPrefixes.add(qNorm.slice(0, 20));
  }

  const now = new Date();
  const postYear = now.getFullYear();
  const yyyymmdd = now.toISOString().slice(0, 10);

  // 카드별 row 생성
  const rows: Record<string, unknown>[] = [];
  const skippedDuplicates: Array<{ idx: number; question: string; reason: string }> = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const q = (c.question ?? "").trim();
    const a = (c.answer ?? "").trim();
    if (!q || !a) {
      return errorResponse(null, "invalid_input", `[admin/draft/publish] card #${i + 1} empty q/a`, 400, undefined, { userMessage: `card #${i + 1}: question/answer 비어있음` });
    }
    const doctorId = slugToId.get(c.doctorSlug);
    if (!doctorId) {
      return errorResponse(null, "invalid_input", `[admin/draft/publish] card #${i + 1} doctor not found`, 400, undefined, { userMessage: `card #${i + 1}: doctor not found for slug ${c.doctorSlug}` });
    }

    // Dedup 검사 — 동일 video 의 기존 카드와 매칭되면 skip.
    const qNorm = normalizeQ(q);
    const startSec = c.timestampStartSec ?? 0;
    const fp = `${startSec}:${qNorm.slice(0, 12)}`;
    const prefix20 = qNorm.slice(0, 20);
    if (existingFingerprints.has(fp)) {
      skippedDuplicates.push({
        idx: i,
        question: q,
        reason: `같은 영상의 ${startSec}s 에 동일 question 존재`,
      });
      continue;
    }
    if (prefix20.length >= 15 && existingPrefixes.has(prefix20)) {
      skippedDuplicates.push({
        idx: i,
        question: q,
        reason: `같은 영상에 거의 동일한 question prefix 존재`,
      });
      continue;
    }
    // 새 카드도 같은 batch 내 중복 차단 (자기 자신끼리)
    existingPrefixes.add(prefix20);
    existingFingerprints.add(fp);

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
      pubmed_refs: c.pubmedRef ? [c.pubmedRef] : null,
      meta: JSON.stringify(metaObj),
      // author = 검수받을 원장님의 profile_id. 매핑 없으면 admin profile_id fallback.
      // (auth.users.id 가 아니라 profiles.id 사용 — Phase 9 FK 정합성)
      author_id:
        doctorIdToProfileId.get(doctorId) ?? guard.adminProfileId,
      created_at: `${yyyymmdd} 00:00:00+09`,
      updated_at: now.toISOString(),
    });
  }

  // 모든 카드가 중복으로 skip 됐을 때 — INSERT 안 함, 응답만 반환.
  if (rows.length === 0) {
    return NextResponse.json(
      {
        saved: 0,
        ids: [],
        videoRowId,
        skipped_duplicates: skippedDuplicates,
        message: "모든 카드가 기존 발행 카드와 중복이라 skip 됐습니다.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("cards")
    .insert(rows)
    .select("id");
  if (insErr) {
    return errorResponse(insErr, "save_failed", "[admin/draft/publish] cards insert", 500);
  }

  return NextResponse.json(
    {
      saved: inserted?.length ?? 0,
      ids: (inserted ?? []).map((r) => r.id),
      videoRowId,
      skipped_duplicates: skippedDuplicates,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
