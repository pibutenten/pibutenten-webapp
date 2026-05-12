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
 *     empty: boolean       // 9명 중 누구도 식별 X → 작업 차단
 *   }
 *
 * 인증: profiles.role='admin'만 허용.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchYoutubeTranscript } from "@/lib/ai/youtube-transcript";
import { identifyDoctors } from "@/lib/ai/identify-doctors";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json(
      { error: "url is required" },
      { status: 400 },
    );
  }

  // 자막 + 메타 fetch
  let transcriptResult;
  try {
    transcriptResult = await fetchYoutubeTranscript(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 자막 fetch 실패 — OAuth 만료가 원인일 수도 있어 상태 같이 반환
    const oauthHealth = await checkOauthHealth();
    return NextResponse.json(
      { error: msg, oauthState: oauthHealth.state },
      { status: 422 },
    );
  }

  // 9명 원장 자동 식별
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
