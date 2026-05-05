import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * POST /api/upload
 * - multipart/form-data, field "file"
 * - 인증 필요 (RLS — articles bucket)
 * - 경로: {user_id}/{timestamp}_{rand}.{ext}
 * - 응답: { url, path }
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "빈 파일" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `파일 크기 한도(${MAX_SIZE / 1024 / 1024}MB) 초과` },
      { status: 400 },
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json(
      { error: "지원되지 않는 파일 형식 (jpeg/png/webp/gif만 가능)" },
      { status: 400 },
    );
  }

  const ext = extFromMime(mime);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${user.id}/${ts}_${rand}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("articles")
    .upload(path, buf, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { error: `업로드 실패: ${upErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = supabase.storage.from("articles").getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, path });
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
