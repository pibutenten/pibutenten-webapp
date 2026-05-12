/**
 * POST /api/admin/draft/step1
 *
 * Phase 8 위저드 Step1 — analyze로 받은 자막을 LLM(Claude)에 보내 Q&A 카드 추출.
 *
 * 입력: { transcript, videoId, videoTitle }
 * 출력: { drafts: DraftCard[] }
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runStep1 } from "@/lib/ai/step1";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  let body: { transcript?: unknown; videoId?: unknown; videoTitle?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const videoId = typeof body.videoId === "string" ? body.videoId : "";
  const videoTitle = typeof body.videoTitle === "string" ? body.videoTitle : "";
  if (!transcript || !videoId) {
    return NextResponse.json(
      { error: "transcript, videoId required" },
      { status: 400 },
    );
  }
  const sourceFile = `${videoId}.ko.vtt`;

  try {
    const drafts = await runStep1({
      transcript,
      videoId,
      videoTitle,
      sourceFile,
    });
    return NextResponse.json(
      { drafts },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Step1 failed: ${msg}` },
      { status: 502 },
    );
  }
}
