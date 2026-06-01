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
import {
  buildSlug,
  resolveSlugCollision,
  normalizeToSlug,
  isValidPostSlug,
} from "@/data/procedure-mappings/slug-mapping";
import { isSlugUniqueViolation, SLUG_TAKEN_MESSAGE } from "@/lib/slug-conflict";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { logAudit } from "@/lib/audit-log";
import { fetchYoutubeUploadDateKst } from "@/lib/ai/youtube-upload-date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CardIn = {
  // P2-4 (2026-05-27): AI 파이프라인도 title/body 통일.
  title: string;
  body: string;
  keywords: string[];
  postSlug?: string; // 관리자가 draft 화면에서 확정한 URL slug (없으면 buildSlug 자동)
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
  // videoId 형식 검증 (재발 방지): 빈 문자열·한글 파일명 등이 meta.video_id 에
  // 들어간 사례가 있어, 11자 유튜브ID 형식이 아니면 발행을 차단한다.
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return errorResponse(null, "invalid_input", "[admin/draft/publish] invalid videoId format", 400, undefined, { userMessage: `videoId 형식이 올바르지 않습니다 (11자 유튜브ID 필요): "${videoId}"` });
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

  // upload_date(영상 게시일) best-effort 채움.
  //   - OAuth(YouTube Data API) refresh_token 만료로 watch 페이지 메타에서 추출.
  //   - 회귀 보호: 기존에 이미 upload_date 가 있는 영상을 null 로 덮으면 안 됨.
  //     기존값 조회 → (새로 구한 값 ?? 기존값 ?? null) 우선순위로 결정.
  //   - 못 구해도(null) 발행은 정상 진행.
  const { data: existingVideoRow } = await supabase
    .from("videos")
    .select("upload_date")
    .eq("youtube_id", videoId)
    .maybeSingle();
  const existingUploadDate =
    (existingVideoRow as { upload_date: string | null } | null)?.upload_date ??
    null;
  const fetchedUploadDate = await fetchYoutubeUploadDateKst(videoId);
  const uploadDate = fetchedUploadDate ?? existingUploadDate ?? null;

  const { data: videoRow, error: vidErr } = await supabase
    .from("videos")
    .upsert(
      {
        youtube_id: videoId,
        youtube_url: youtubeUrl,
        topic: videoTitle || null,
        upload_date: uploadDate,
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
  // 관리자가 확정한(비어있지 않은) slug 가 중복·형식오류이면 여기 모아 발송 차단 (자동 -2 안 함).
  const slugErrors: string[] = [];
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

    // post_slug 결정 — 2026-05-30 정책:
    //   · 관리자가 값을 둔(비어있지 않은) slug 는 "확정값" → 자동 -2 하지 않는다.
    //     형식 오류 / 같은 (doctor_id, post_year) 의 기존·배치 중복이면 slugErrors 에 모아 발송 차단.
    //     (관리자가 모르게 -2 로 바뀌어 의도와 다른 URL 로 나가는 것을 방지)
    //   · 빈 칸이면 buildSlug(keywords) 자동 제안 + 충돌 시 -2/-3 (사람이 정한 게 아니므로 허용).
    //   · 키워드 매핑 실패(untagged-) 시에만 영상ID-인덱스 fallback (드묾).
    const tags = normalizeTags(c.keywords ?? []);
    if (!usedSlugsByDoctor.has(doctorId)) usedSlugsByDoctor.set(doctorId, new Set());
    const usedSet = usedSlugsByDoctor.get(doctorId)!;
    let postSlug: string;
    const clientSlug =
      typeof c.postSlug === "string" ? normalizeToSlug(c.postSlug) : "";
    if (clientSlug) {
      // 관리자 확정 slug — 자동 -2 금지.
      if (!isValidPostSlug(clientSlug)) {
        slugErrors.push(`카드 #${i + 1} ("${q.slice(0, 18)}"): slug 형식 오류`);
        postSlug = clientSlug; // placeholder — slugErrors 로 인해 어차피 insert 안 됨
      } else if (usedSet.has(clientSlug)) {
        slugErrors.push(
          `카드 #${i + 1} ("${q.slice(0, 18)}"): slug '${clientSlug}' 가 다른 카드/기존 글과 중복`,
        );
        postSlug = clientSlug;
      } else {
        postSlug = clientSlug;
        usedSet.add(clientSlug);
      }
    } else {
      // 빈 칸 → 자동 제안 (buildSlug + -2 유지)
      const baseSlug = tags.length > 0 ? buildSlug(tags.slice(0, 5)) : "";
      if (baseSlug && !baseSlug.startsWith("untagged-")) {
        postSlug = resolveSlugCollision(baseSlug, usedSet);
        usedSet.add(postSlug);
      } else {
        postSlug = `${videoId}-${i + 1}`.slice(0, 80);
      }
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

  // 관리자 확정 slug 중복/형식오류가 하나라도 있으면 발송 차단 (자동 -2 안 함).
  //   ★ 한 건도 insert 하지 않고 거부 → 사용자가 해당 카드 slug 를 수정 후 재발송.
  if (slugErrors.length > 0) {
    return errorResponse(null, "invalid_input", "[admin/draft/publish] slug collision", 409, undefined, {
      userMessage: `slug 중복/오류로 발송이 차단됐습니다 (자동 변경하지 않음): ${slugErrors.join(" / ")}. 해당 카드의 URL slug 를 다르게 수정한 뒤 다시 발송하세요.`,
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
    if (isSlugUniqueViolation(insErr)) {
      return errorResponse(insErr, "invalid_input", "[admin/draft/publish] slug unique", 409, undefined, {
        userMessage: SLUG_TAKEN_MESSAGE,
      });
    }
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
