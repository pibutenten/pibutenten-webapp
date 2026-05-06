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
    .select("role, terms_agreed_at, display_name, birthdate")
    .eq("id", user.id)
    .maybeSingle();

  // 4) 약관 미동의 → /signup
  if (!profile || !profile.terms_agreed_at) {
    const qs = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(`${origin}/signup${qs}`);
  }

  // 5) 약관 동의는 했지만 추가정보(생년월일 등) 미입력 → /onboarding
  //    일반 사용자에게만 강제 (doctor / admin은 운영용 계정이라 스킵 가능)
  if (
    profile.role !== "doctor" &&
    profile.role !== "admin" &&
    !profile.birthdate
  ) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  // 6) 모든 role은 /feed로 (관리/내 글 페이지는 헤더 본인 아이콘으로 진입)
  const dest = next || "/feed";
  return NextResponse.redirect(`${origin}${dest}`);
}
