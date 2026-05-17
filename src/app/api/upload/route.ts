import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import sharp from "sharp";

export const runtime = "nodejs"; // sharp 는 Edge runtime 미지원
export const dynamic = "force-dynamic";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Phase 6-6 (2026-05-16): sharp 로 EXIF 메타데이터 제거 + 재인코딩.
 *
 * 보안:
 *  - GPS 위경도 / 촬영 일시 / 카메라 시리얼 등 모든 EXIF 제거 (헬스케어 플랫폼 — 환부 사진 등에서 추적 가능 정보 노출 차단)
 *  - 매직바이트 검증을 sharp 의 자체 파일 형식 인식으로 강화 (위장 차단)
 *
 * 정책:
 *  - jpeg/png/webp: sharp 로 처리 + 메타데이터 제거 + 동일 포맷 재인코딩 (quality 85)
 *  - gif: 애니메이션 손상 위험 — sharp 처리 X, magic-byte 검증만
 *  - 최대 2560×2560 으로 리사이즈 (원본 비율 유지, fit: inside)
 */
const SHARP_RESIZE_MAX = 2560;

async function processImage(
  buf: Buffer,
  mime: string,
): Promise<{ ok: true; out: Buffer; mime: string } | { ok: false; error: string }> {
  // gif 는 애니메이션 보존 위해 sharp pass (대신 매직바이트 검증 통과 필수)
  if (mime === "image/gif") {
    return { ok: true, out: buf, mime };
  }
  try {
    // failOnError:false — 손상된 입력도 가능한 한 처리. 메타데이터 자동 제거됨.
    let pipeline = sharp(buf, { failOn: "none" })
      .rotate() // EXIF orientation 적용 후 EXIF 제거 (자동)
      .resize({
        width: SHARP_RESIZE_MAX,
        height: SHARP_RESIZE_MAX,
        fit: "inside",
        withoutEnlargement: true,
      });

    // 원본 포맷으로 재인코딩 — withMetadata() 호출 안 함 (기본 동작이 메타데이터 제거)
    if (mime === "image/jpeg") {
      pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    } else if (mime === "image/png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (mime === "image/webp") {
      pipeline = pipeline.webp({ quality: 85 });
    }

    const out = await pipeline.toBuffer();
    return { ok: true, out, mime };
  } catch (e) {
    return {
      ok: false,
      error: `이미지 처리 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

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

  // Rate limit (A8): 사용자당 분당 20회. 이미지 폭주 업로드 방어.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "upload",
    userId: user.id,
    max: 20,
    windowSeconds: 60,
  });
  if (limited) return limited;

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

  const rawBuf = Buffer.from(await file.arrayBuffer());

  // 매직바이트 검증 (2026-05-16) — 클라가 MIME만 위장해서 SVG 등 위험 파일을 jpg로 신고하는 케이스 차단
  if (!matchesMagicBytes(rawBuf, mime)) {
    return NextResponse.json(
      { error: "파일 내용이 선언한 형식과 일치하지 않습니다." },
      { status: 400 },
    );
  }

  // Phase 6-6: sharp 로 EXIF 메타데이터 제거 + 재인코딩 (gif 는 제외)
  const processed = await processImage(rawBuf, mime);
  if (!processed.ok) {
    return NextResponse.json({ error: processed.error }, { status: 400 });
  }
  const outBuf = processed.out;
  const outMime = processed.mime;

  // Phase 6-6: 파일명은 crypto.randomUUID (이전 Math.random 41bit → 122bit, 충돌·예측 불가).
  const ext = extFromMime(outMime);
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("articles")
    .upload(path, outBuf, {
      contentType: outMime,
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
