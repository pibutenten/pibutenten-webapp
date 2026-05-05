/**
 * POST /api/admin/draft
 *
 * 관리자 전용. YouTube URL + doctorSlug 를 받아
 *  1) 자막 fetch
 *  2) Anthropic Claude 로 Q&A 초안 5~10개 생성
 *  3) 결과를 그대로 JSON 반환 (DB 저장은 별도 endpoint)
 *
 * 인증: Supabase auth.getUser → profiles.role='admin' 체크. 아니면 401/403.
 *
 * 입력 (JSON body):
 *   { url: string; doctorSlug: string }
 *
 * 출력:
 *   { videoId: string; title: string | null; doctorName: string; drafts: DraftQA[] }
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchYoutubeTranscript } from "@/lib/ai/youtube-transcript";
import { generateQADrafts } from "@/lib/ai/draft-generator";

export const dynamic = "force-dynamic";
// 자막 fetch + Claude 호출이 합쳐지면 시간이 걸릴 수 있어 maxDuration 넉넉히
export const maxDuration = 120;

type Body = {
  url?: unknown;
  doctorSlug?: unknown;
};

export async function POST(req: Request) {
  // ── 1) 입력 파싱
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const doctorSlug = typeof body.doctorSlug === "string" ? body.doctorSlug.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!doctorSlug) {
    return NextResponse.json({ error: "doctorSlug is required" }, { status: 400 });
  }

  // ── 2) 인증 + 관리자 권한
  const supabase = await createSupabaseServerClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  // ── 3) doctorSlug → name 조회
  const { data: doctor, error: doctorErr } = await supabase
    .from("doctors")
    .select("slug, name")
    .eq("slug", doctorSlug)
    .single();
  if (doctorErr || !doctor) {
    return NextResponse.json(
      { error: `Doctor not found for slug: ${doctorSlug}` },
      { status: 404 },
    );
  }

  // ── 4) 자막 fetch
  let transcriptResult;
  try {
    transcriptResult = await fetchYoutubeTranscript(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to fetch transcript: ${msg}` },
      { status: 422 },
    );
  }

  // ── 5) Claude 로 Q&A 초안 생성
  let drafts;
  try {
    drafts = await generateQADrafts(transcriptResult.transcript, doctor.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to generate drafts: ${msg}` },
      { status: 502 },
    );
  }

  // ── 6) 응답
  return NextResponse.json(
    {
      videoId: transcriptResult.videoId,
      title: transcriptResult.title,
      doctorName: doctor.name,
      drafts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
