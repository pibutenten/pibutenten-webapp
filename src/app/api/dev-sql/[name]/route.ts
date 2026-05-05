import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 개발 전용 라우트: 마이그레이션 SQL 파일을 CORS 허용으로 서빙.
 * Supabase Dashboard 탭에서 fetch해서 SQL Editor Monaco에 주입할 때 사용.
 *
 * ⚠ 운영 배포 시 반드시 제거하거나 환경변수로 게이팅할 것.
 */
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "0004a_videos",
  "0004b_qas_part01",
  "0004b_qas_part02",
  "0004b_qas_part03",
  "0004b_qas_part04",
]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  // 운영 환경 차단
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("disabled in production", { status: 403 });
  }
  const { name } = await ctx.params;
  if (!ALLOWED.has(name)) {
    return new NextResponse("not found", { status: 404 });
  }
  try {
    const filePath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      `${name}.sql`,
    );
    const sql = await readFile(filePath, "utf-8");
    return new NextResponse(sql, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(`read error: ${(e as Error).message}`, {
      status: 500,
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}
