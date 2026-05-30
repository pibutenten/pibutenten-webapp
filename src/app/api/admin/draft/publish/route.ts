/**
 * POST /api/admin/draft/publish
 *
 * Phase 8 위저드 Step3 — 검수 완료된 카드 N개를 cards INSERT + 발행.
 *
 * 입력: {
 *   videoId: string,
 *   videoTitle: string,
 *   cards: [{
 *     title, body, keywords[], category,
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
import { buildSlug, resolveSlugCollision } from "@/data/procedure-mappings/slug-mapping";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CardIn = {
  // P2-4 (2026-05-27): AI 파이프라인도 title/body 통일.
  title: string;
  body: string;
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
  // 매칭 기준: 동일 video_id + (start_seconds 동일 OR 정규화된 title prefix 20자 일치).
  // 매칭된 후보 카드는 자동 skip 하고 응답에 skipped 목록 반환.
  const { data: existingCards } = await supabase
    .from("cards")
    .select("id, title, meta")
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
    const qNorm = normalizeQ(row.title as string);
    if (startSec !== null) {
      existingFingerprints.add(`${startSec}:${qNorm.slice(0, 12)}`);
    }
    if (qNorm.length >= 15) existingPrefixes.add(qNorm.slice(0, 20));
  }

  const now = new Date();
  // KST 보정 (M1, 2026-05-28): UTC 자정~KST 자정 (UTC 15~24시) 사이 publish 시 post_year/생성일이
  // 전날로 잡히는 결함 방어. +9h offset 후 UTC 메서드 사용 = KST.
  const nowKst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const postYear = nowKst.getUTCFullYear();
  const yyyymmdd = nowKst.toISOString().slice(0, 10);

  // post_slug 충돌 회피용 — 같은 (doctor_id, post_year) 의 기존 slug 를 doctor 별로 미리 적재.
  // 배치 내 카드끼리도 같은 set 에 누적해 충돌 방지 (한 영상 N카드 키워드 겹침 대비).
  const batchDoctorIds = Array.from(
    new Set(
      cards
        .map((c) => slugToId.get(c.doctorSlug))
        .filter((x): x is string => !!x),
    ),
  );
  const usedSlugsByDoctor = new Map<string, Set<string>>();
  if (batchDoctorIds.length > 0) {
    const { data: existingSlugRows } = await supabase
      .from("cards")
      .select("doctor_id, post_slug")
      .in("doctor_id", batchDoctorIds)
      .eq("post_year", postYear)
      .not("post_slug", "is", null);
    for (const r of existingSlugRows ?? []) {
      const did = (r as { doctor_id: string | null }).doctor_id;
      const ps = (r as { post_slug: string | null }).post_slug;
      if (!did || !ps) continue;
      if (!usedSlugsByDoctor.has(did)) usedSlugsByDoctor.set(did, new Set());
      usedSlugsByDoctor.get(did)!.add(ps);
    }
  }

  // 카드별 row 생성
  const rows: Record<string, unknown>[] = [];
  const skippedDuplicates: Array<{ idx: number; title: string; reason: string }> = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const q = (c.title ?? "").trim();
    const a = (c.body ?? "").trim();
    if (!q || !a) {
      return errorResponse(null, "invalid_input", `[admin/draft/publish] card #${i + 1} empty title/body`, 400, undefined, { userMessage: `card #${i + 1}: 제목/본문 비어있음` });
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
        title: q,
        reason: `같은 영상의 ${startSec}s 에 동일 title 존재`,
      });
      continue;
    }
    if (prefix20.length >= 15 && existingPrefixes.has(prefix20)) {
      skippedDuplicates.push({
        idx: i,
        title: q,
        reason: `같은 영상에 거의 동일한 title prefix 존재`,
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

    // post_slug: 키워드 기반 SEO slug (PRD §11-A). /api/articles 와 동일 정책으로 통일.
    //   buildSlug(keywords) → 같은 (doctor_id, post_year) 기존 slug + 배치 내 카드끼리 충돌 회피 (-2/-3).
    //   키워드 매핑 실패(untagged-) 시에만 영상ID-인덱스 fallback (드묾).
    const tags = normalizeTags(c.keywords ?? []);
    let postSlug: string;
    const baseSlug = tags.length > 0 ? buildSlug(tags.slice(0, 5)) : "";
    if (baseSlug && !baseSlug.startsWith("untagged-")) {
      if (!usedSlugsByDoctor.has(doctorId)) usedSlugsByDoctor.set(doctorId, new Set());
      const used = usedSlugsByDoctor.get(doctorId)!;
      postSlug = resolveSlugCollision(baseSlug, used);
      used.add(postSlug);
    } else {
      postSlug = `${videoId}-${i + 1}`.slice(0, 80);
    }
    const shortcode = generateShortcode();

    rows.push({
      doctor_id: doctorId,
      video_id: videoRowId, // ← videos.id 필수 채움 (single source)
      type: "qa",
      category: "qa",
      status,
      is_pick: false,
      title: q,
      body: a,
      keywords: tags,
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

  const insertedIds = (inserted ?? []).map((r) => r.id);

  // PIPA 안전성 확보조치 §8: admin 의 대량 카드 발행 audit (의료 콘텐츠 책임 추적).
  await logAudit({
    action: "card.publish",
    actorProfileId: guard.adminProfileId,
    actorAuthUserId: guard.userId,
    targetTable: "cards",
    targetId: videoRowId,
    request: req,
    metadata: {
      videoId,
      videoRowId,
      cardIds: insertedIds,
      saved: insertedIds.length,
      skipped: skippedDuplicates.length,
      status,
    },
  });

  return NextResponse.json(
    {
      saved: insertedIds.length,
      ids: insertedIds,
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
