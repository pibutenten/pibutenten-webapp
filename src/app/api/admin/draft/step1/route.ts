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

  let body: {
    transcript?: unknown;
    videoId?: unknown;
    videoTitle?: unknown;
    doctors?: unknown;
    primarySlug?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const videoId = typeof body.videoId === "string" ? body.videoId : "";
  const videoTitle = typeof body.videoTitle === "string" ? body.videoTitle : "";
  const primarySlug =
    typeof body.primarySlug === "string" ? body.primarySlug : undefined;
  const doctors = Array.isArray(body.doctors)
    ? (body.doctors as unknown[])
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const o = d as Record<string, unknown>;
          const slug = typeof o.slug === "string" ? o.slug : null;
          const name = typeof o.name === "string" ? o.name : null;
          const frequency = typeof o.frequency === "number" ? o.frequency : 0;
          if (!slug || !name) return null;
          return { slug, name, frequency };
        })
        .filter((d): d is { slug: string; name: string; frequency: number } =>
          Boolean(d),
        )
    : undefined;
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
      doctors,
      primarySlug,
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
