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

  // 매직바이트 검증 (2026-05-16) — 클라가 MIME만 위장해서 SVG 등 위험 파일을 jpg로 신고하는 케이스 차단
  if (!matchesMagicBytes(buf, mime)) {
    return NextResponse.json(
      { error: "파일 내용이 선언한 형식과 일치하지 않습니다." },
      { status: 400 },
    );
  }

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

/**
 * 첫 몇 바이트의 magic number 로 실제 형식 검증.
 * 클라이언트가 보낸 MIME 헤더만 신뢰하면 SVG/HTML 등을 image/jpeg 라고 위장해 업로드 가능 →
 * avatars 버킷은 public 이라 XSS 벡터가 되므로 차단.
 */
function matchesMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case "image/jpeg":
      // FF D8 FF
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    case "image/webp":
      // RIFF....WEBP  (offset 0: 'RIFF', offset 8: 'WEBP')
      return (
        buf.slice(0, 4).toString("ascii") === "RIFF" &&
        buf.slice(8, 12).toString("ascii") === "WEBP"
      );
    case "image/gif":
      // GIF87a | GIF89a
      return (
        buf.slice(0, 4).toString("ascii") === "GIF8" &&
        (buf[4] === 0x37 || buf[4] === 0x39) &&
        buf[5] === 0x61
      );
    default:
      return false;
  }
}
