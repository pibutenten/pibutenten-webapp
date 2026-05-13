/**
 * GET /api/admin/youtube-oauth/start
 *
 * 운영자(관리자)가 클릭하면 Google OAuth 동의 화면으로 302 redirect.
 * 동의 완료 후 /api/admin/youtube-oauth/callback 로 돌아옴.
 *
 * 클라이언트 ID/Secret은 .env.local에 미리 설정되어 있어야 함.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

// 도메인은 NEXT_PUBLIC_SITE_URL(production) > VERCEL_URL > localhost 순.
// Google OAuth 콘솔의 "승인된 리디렉션 URI"에 동일 값 등록 필요.
function getRedirectUri(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return `${explicit}/api/admin/youtube-oauth/callback`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}/api/admin/youtube-oauth/callback`;
  return "http://localhost:3000/api/admin/youtube-oauth/callback";
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "YOUTUBE_OAUTH_CLIENT_ID not set" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.force-ssl",
    access_type: "offline",
    prompt: "consent", // 매번 refresh_token 발급 보장
    include_granted_scopes: "true",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
