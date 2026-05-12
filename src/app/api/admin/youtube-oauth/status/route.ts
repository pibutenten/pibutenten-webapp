/**
 * GET /api/admin/youtube-oauth/status
 *
 * OAuth refresh_token 상태 조회. /admin 대시보드 카드 라벨·재인증 버튼 노출에 사용.
 *
 * 출력:
 *   { state: "disabled" | "ok" | "expired" | "error", detail?: string, expiresAt?: number }
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOauthHealth } from "@/lib/ai/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await checkOauthHealth();
  return NextResponse.json(health, {
    headers: { "cache-control": "no-store" },
  });
}
