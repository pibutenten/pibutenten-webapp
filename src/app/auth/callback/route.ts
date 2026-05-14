import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth 콜백 Route Handler.
 *
 * Provider(Google/Kakao 등) → Supabase → 이 endpoint 로 redirect 된다.
 *  - ?code=...      : auth code (PKCE)  → exchangeCodeForSession 으로 세션 발급
 *  - ?error=...     : provider 에러 메시지 (취소/거부 등)
 *  - ?next=/        : 최종 도착 경로 (signInWithOAuth 호출 시 redirectTo 에 같이 실어 보냄)
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

  // 2) 세션 발급 — 두 흐름 모두 지원
  //    (a) Google/Kakao OAuth (PKCE): ?code=...
  //    (b) Naver/Magic link (admin generateLink): ?token_hash=...&type=magiclink
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("OAuth 콜백 파라미터 누락")}`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (code) {
    // (a) PKCE — OAuth provider code 교환
    const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeErr) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeErr.message || "세션 발급 실패")}`,
      );
    }
  } else if (tokenHash && otpType) {
    // (b) Magic link verify — Naver 자체 OAuth 흐름의 자동 로그인 경로.
    //   ⚠ 다른 계정으로 전환하는 경우(예: 구글 jminbae@gmail.com 세션이 살아있는 상태에서
    //     네이버 jminbae@naver.com 시도)에 잔여 세션이 우선되어 사용자가 혼란을 겪음.
    //     → 명시적으로 signOut 후 verifyOtp.
    await supabase.auth.signOut();

    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as "magiclink" | "signup" | "recovery" | "invite" | "email_change" | "email",
    });
    if (verifyErr || !verifyData.session) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(verifyErr?.message || "토큰 검증 실패")}`,
      );
    }
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
    .select("role, terms_agreed_at, display_name, birthdate, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // 4-1) OAuth provider 프로필 이미지 → profiles.avatar_url 자동 채우기
  //   Google: user_metadata.picture / Kakao: avatar_url / Naver: avatar_url (Naver 콜백에서 set)
  //   profiles.avatar_url 비어 있을 때만 채움 (사용자가 온보딩에서 선택한 아바타는 보존)
  if (profile && !profile.avatar_url) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    let oauthAvatar =
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      null;
    // Mixed Content 방지: 카카오 등 일부 OAuth provider가 http URL을 반환할 때 https로 강제 업그레이드.
    if (oauthAvatar && oauthAvatar.startsWith("http://")) {
      oauthAvatar = "https://" + oauthAvatar.slice(7);
    }
    if (oauthAvatar) {
      try {
        await supabase
          .from("profiles")
          .update({ avatar_url: oauthAvatar })
          .eq("id", user.id);
      } catch {
        // 실패해도 로그인 흐름은 계속 진행
      }
    }
  }

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

  // 6) 모든 role은 / 메인 피드로 (관리/내 글 페이지는 헤더 본인 아이콘으로 진입)
  const dest = next || "/";
  return NextResponse.redirect(`${origin}${dest}`);
}
