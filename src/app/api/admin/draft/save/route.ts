import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

type DraftQA = {
  question: string;
  answer: string;
  keywords: string[];
};

type SaveBody = {
  doctorSlug: string;
  videoId: string;
  videoTitle?: string | null;
  youtubeUrl: string;
  draft?: DraftQA;
  drafts?: DraftQA[];
  status?: "draft" | "pending_review" | "published";
};

/**
 * POST /api/admin/draft/save
 * 단일 초안 또는 일괄 저장 — qas + videos 테이블에 insert.
 * 관리자 전용.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const supabase = await createSupabaseServerClient();

  let body: SaveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 });
  }

  const drafts: DraftQA[] = body.drafts ?? (body.draft ? [body.draft] : []);
  if (drafts.length === 0) {
    return NextResponse.json({ error: "초안이 없습니다" }, { status: 400 });
  }
  if (!body.doctorSlug || !body.videoId || !body.youtubeUrl) {
    return NextResponse.json(
      { error: "doctorSlug, videoId, youtubeUrl 필수" },
      { status: 400 },
    );
  }

  // doctor_id 조회
  const { data: doctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("slug", body.doctorSlug)
    .maybeSingle();
  if (!doctor) {
    return NextResponse.json({ error: "원장을 찾을 수 없음" }, { status: 404 });
  }

  // video 등록 (있으면 재사용)
  const youtubeUrl = body.youtubeUrl;
  const videoYoutubeId = body.videoId;
  const videoTitle = body.videoTitle ?? null;

  let videoRowId: string | null = null;
  const { data: existingVideo } = await supabase
    .from("videos")
    .select("id")
    .eq("youtube_id", videoYoutubeId)
    .maybeSingle();
  if (existingVideo) {
    videoRowId = existingVideo.id;
  } else {
    const { data: newVideo, error: vErr } = await supabase
      .from("videos")
      .insert({
        youtube_id: videoYoutubeId,
        youtube_url: youtubeUrl,
        topic: videoTitle,
      })
      .select("id")
      .single();
    if (vErr || !newVideo) {
      return NextResponse.json(
        { error: `videos insert 실패: ${vErr?.message}` },
        { status: 500 },
      );
    }
    videoRowId = newVideo.id;
  }

  // qas 일괄 insert
  const status = body.status ?? "pending_review";
  const rows = drafts.map((d) => ({
    question: d.question,
    answer: d.answer,
    keywords: d.keywords,
    doctor_id: doctor.id,
    video_id: videoRowId,
    status,
    type: "qa" as const,
    author_id: guard.userId,
    published: status === "published",
  }));

  const { data: inserted, error: iErr } = await supabase
    .from("qas")
    .insert(rows)
    .select("id");

  if (iErr) {
    return NextResponse.json(
      { error: `qas insert 실패: ${iErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    saved: inserted?.length ?? 0,
    ids: inserted?.map((r) => r.id) ?? [],
  });
}
