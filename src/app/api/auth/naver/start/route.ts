import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildNaverAuthorizeUrl, loadNaverEnv } from "@/lib/auth/naver";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/naver/start?next=/
 *
 * 1) state(CSRF 방어 토큰) 생성 → 쿠키 set
 * 2) next(로그인 후 도착 경로) 쿠키 set
 * 3) 네이버 authorize URL로 redirect
 *
 * NAVER_CLIENT_ID/SECRET 환경변수 미설정 시 → /login?error=...로 안내.
 */
export async function GET(request: NextRequest) {
  const env = loadNaverEnv(SITE_URL);
  if (!env) {
    const url = new URL("/login", request.url);
    url.searchParams.set(
      "error",
      "네이버 로그인 환경변수가 설정되지 않았습니다.",
    );
    return NextResponse.redirect(url);
  }

  const state = randomBytes(16).toString("hex");
  const next = request.nextUrl.searchParams.get("next") ?? "";

  const authorizeUrl = buildNaverAuthorizeUrl(env, state);
  const res = NextResponse.redirect(authorizeUrl);

  // state cookie — CSRF 방어 (10분 유효)
  res.cookies.set("naver_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10,
  });
  // next cookie — 로그인 후 도착 경로
  if (next) {
    res.cookies.set("naver_oauth_next", next, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 10,
    });
  }
  return res;
}
