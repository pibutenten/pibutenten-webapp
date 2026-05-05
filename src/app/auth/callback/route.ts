import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth 콜백 Route Handler.
 *
 * Provider(Google/Kakao 등) → Supabase → 이 endpoint 로 redirect 된다.
 *  - ?code=...      : auth code (PKCE)  → exchangeCodeForSession 으로 세션 발급
 *  - ?error=...     : provider 에러 메시지 (취소/거부 등)
 *  - ?next=/feed    : 최종 도착 경로 (signInWithOAuth 호출 시 redirectTo 에 같이 실어 보냄)
 *
 * 동작:
 *  1) code 교환 → 쿠키에 세션 저장
 *  2) profiles 조회
 *     - 온보딩 미완료(terms_agreed_at IS NULL) → /signup
 *     - role 별 destination
 *  3) NextResponse.redirect 로 풀 navigation (브라우저 cookies 가 layout 으로 전달되도록)
 *
 * Next.js 16 의 Route Handler 규약(GET 함수, NextRequest, NextResponse) 준수.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDesc = url.searchParams.get("error_description");
  const next = url.searchParams.get("next") || "";

  // origin 은 same-host 안전 redirect 베이스
  const origin = url.origin;

  // 1) provider 측 에러 (사용자가 취소했거나 거부)
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("OAuth 콜백 파라미터 누락")}`,
    );
  }

  // 2) code → session 교환
  const supabase = await createSupabaseServerClient();
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeErr.message || "세션 발급 실패")}`,
    );
  }

  // 3) 사용자/프로필 조회
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("사용자 확인 실패")}`,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, terms_agreed_at, display_name")
    .eq("id", user.id)
    .maybeSingle();

  // 4) 온보딩 미완료 → /signup
  //    (handle_new_user 트리거가 profiles row 는 자동 생성하므로 profile 자체는 존재한다.
  //     단, terms_agreed_at 이 null 이면 약관 동의가 안 된 신규/마이그레이션 사용자.)
  if (!profile || !profile.terms_agreed_at) {
    const qs = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(`${origin}/signup${qs}`);
  }

  // 5) 모든 role은 /feed로 (관리/내 글 페이지는 헤더 본인 아이콘으로 진입)
  const dest = next || "/feed";
  return NextResponse.redirect(`${origin}${dest}`);
}
