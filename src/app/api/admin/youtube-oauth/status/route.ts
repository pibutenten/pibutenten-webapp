/**
 * GET /api/admin/youtube-oauth/status
 *
 * OAuth refresh_token 상태 조회. /admin 대시보드 카드 라벨·재인증 버튼 노출에 사용.
 *
 * 출력:
 *   { state: "disabled" | "ok" | "expired" | "error", detail?: string, expiresAt?: number }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const health = await checkOauthHealth();
  return NextResponse.json(health, {
    headers: { "cache-control": "no-store" },
  });
}
