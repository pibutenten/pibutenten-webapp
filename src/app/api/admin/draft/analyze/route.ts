/**
 * POST /api/admin/draft/analyze
 *
 * Phase 8 위저드 Step 0 — YouTube URL → 자막 + 영상 메타 + 원장 자동 식별.
 *
 * 입력: { url: string }
 * 출력:
 *   {
 *     videoId, title, source: "ko-manual"|"ko-auto"|...,
 *     transcript,          // step1 호출에 그대로 전달용 (UI에서는 hidden)
 *     doctors: [{name, slug, frequency, selfIntro, inTitle}],
 *     primary: {name, slug, ...} | null,
 *     empty: boolean       // 등록 원장님들 중 누구도 식별 X → 작업 차단
 *   }
 *
 * 인증: profiles.role='admin'만 허용.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { fetchYoutubeTranscript } from "@/lib/ai/youtube-transcript";
import { identifyDoctors } from "@/lib/ai/identify-doctors";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/draft/analyze] body parse", 400, undefined, { userMessage: "Invalid JSON body" });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return errorResponse(null, "invalid_input", "[admin/draft/analyze] url required", 400, undefined, { userMessage: "url is required" });
  }

  // 자막 + 메타 fetch
  let transcriptResult;
  try {
    transcriptResult = await fetchYoutubeTranscript(url);
  } catch (e) {
    // 자막 fetch 실패 — OAuth 만료가 원인일 수도 있어 oauthState 를 함께 반환 (UI 분기용).
    const oauthHealth = await checkOauthHealth();
    return errorResponse(
      e,
      "network_failed",
      "[admin/draft/analyze] transcript fetch",
      422,
      { oauthState: oauthHealth.state },
      {
        userMessage: "자막을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
        bodyExtra: { oauthState: oauthHealth.state },
      },
    );
  }

  // 참여 전문의 자동 식별
  const idResult = identifyDoctors({
    transcript: transcriptResult.transcript,
    videoTitle: transcriptResult.title,
  });

  return NextResponse.json(
    {
      videoId: transcriptResult.videoId,
      title: transcriptResult.title,
      source: transcriptResult.source,
      transcript: transcriptResult.transcript,
      doctors: idResult.matches,
      primary: idResult.primary,
      empty: idResult.empty,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
