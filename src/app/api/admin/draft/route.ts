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
  // doctorSlug 비어있으면 자동 매칭 시도 (영상 제목/자막에서 원장 이름 contains)
  const inputDoctorSlug =
    typeof body.doctorSlug === "string" ? body.doctorSlug.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
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

  // ── 3) 자막 fetch (자동 매칭에도 필요하므로 먼저 실행)
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

  // ── 4) doctor 결정: 입력이 있으면 그것, 없으면 자동 매칭
  const { data: allDoctors } = await supabase
    .from("doctors")
    .select("slug, name");
  if (!allDoctors || allDoctors.length === 0) {
    return NextResponse.json({ error: "원장 데이터 없음" }, { status: 500 });
  }

  let doctorSlug = inputDoctorSlug;
  let matchedDoctors: { slug: string; name: string }[] = [];

  if (!doctorSlug) {
    // 자동 매칭 — 영상 제목 + 자막 첫 1500자에서 원장 이름 등장 횟수
    const haystack =
      ((transcriptResult.title ?? "") + "\n" +
        transcriptResult.transcript.slice(0, 1500))
        .toLowerCase();
    const counts = allDoctors
      .map((d) => {
        // 한글 이름 contains 카운트
        const re = new RegExp(d.name, "g");
        const matches = haystack.match(re);
        return { slug: d.slug, name: d.name, count: matches?.length ?? 0 };
      })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);

    matchedDoctors = counts.map(({ slug, name }) => ({ slug, name }));

    if (counts.length > 0) {
      doctorSlug = counts[0].slug; // 가장 자주 등장한 원장
    }
  }

  if (!doctorSlug) {
    // 자동 매칭 실패 → 클라이언트에서 수동 선택하도록 응답
    return NextResponse.json(
      {
        videoId: transcriptResult.videoId,
        title: transcriptResult.title,
        needsManualDoctor: true,
        matchedDoctors,
        message: "영상에서 등록된 원장 이름을 찾지 못했습니다. 직접 선택해주세요.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const doctor = allDoctors.find((d) => d.slug === doctorSlug);
  if (!doctor) {
    return NextResponse.json(
      { error: `Doctor not found for slug: ${doctorSlug}` },
      { status: 404 },
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
      doctorSlug: doctor.slug,
      doctorName: doctor.name,
      // 둘 이상 매칭된 경우 알림용 (단일 매칭은 제외)
      matchedDoctors: matchedDoctors.length > 1 ? matchedDoctors : undefined,
      drafts,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
