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
import { requireAdmin } from "@/lib/admin-guard";
import { runStep1 } from "@/lib/ai/step1";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const supabase = await createSupabaseServerClient();

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
    const result = await runStep1({
      transcript,
      videoId,
      videoTitle,
      sourceFile,
    });
    console.log(
      `[step1] video=${videoId} drafts=${result.drafts.length} model=${result.model} ` +
        `usage_input=${result.usage.input_tokens} usage_output=${result.usage.output_tokens}`,
    );
    return NextResponse.json(
      { drafts: result.drafts, usage: result.usage, model: result.model },
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
