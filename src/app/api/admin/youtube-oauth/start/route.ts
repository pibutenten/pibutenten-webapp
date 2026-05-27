/**
 * GET /api/admin/youtube-oauth/start
 *
 * 운영자(관리자)가 클릭하면 Google OAuth 동의 화면으로 302 redirect.
 * 동의 완료 후 /api/admin/youtube-oauth/callback 로 돌아옴.
 *
 * 클라이언트 ID/Secret은 .env.local에 미리 설정되어 있어야 함.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/admin-guard";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

/** state 쿠키 이름 — callback 에서 동일 cookie 값 검증 (CSRF 방어). */
export const YOUTUBE_OAUTH_STATE_COOKIE = "pibutenten_yt_oauth_state";
/** state 유효 기간 (초) — 동의 화면 머무는 시간 고려해 넉넉히. */
export const YOUTUBE_OAUTH_STATE_MAX_AGE_SEC = 600;

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
    // 환경변수 누락은 운영 사고. 사용자에게는 일반 문구만, 서버 로그에 변수명 기록.
    return errorResponse(
      new Error("YOUTUBE_OAUTH_CLIENT_ID not set"),
      "generic",
      "[admin/youtube-oauth/start] env var missing",
      500,
    );
  }

  // CSRF state — 예측 불가능한 32-byte hex 난수.
  // 쿠키 + URL 양쪽에 실어 보내 callback 에서 일치 확인.
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: YOUTUBE_OAUTH_STATE_MAX_AGE_SEC,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.force-ssl",
    access_type: "offline",
    prompt: "consent", // 매번 refresh_token 발급 보장
    include_granted_scopes: "true",
    state, // CSRF 방어 — Phase 5-6
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
