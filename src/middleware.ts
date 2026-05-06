import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * 온보딩 가드 면제 경로 (prefix 매치).
 * - 인증 흐름: /signup, /login, /auth/*
 * - 온보딩 자체: /onboarding
 * - API: 서버 API는 가드 안 함 (각 라우트에서 인증 처리)
 */
const ONBOARDING_EXEMPT_PREFIXES = [
  "/onboarding",
  "/signup",
  "/login",
  "/auth/",
  "/api/",
];

/** 확장자로 정적 자산 판별 — 이미지/폰트/스타일 등은 redirect 대상에서 제외 */
const STATIC_EXTENSIONS = [
  ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".otf",
  ".map", ".json", ".txt", ".xml", ".webmanifest",
];

/**
 * 온보딩 완료 캐시 쿠키 — DB 조회 비용 절감용.
 * onboarding 저장 시 클라이언트가 set, 만료 시 다시 DB 조회.
 */
const ONBOARDED_COOKIE = "pibutenten_onboarded";

/**
 * Supabase Auth 토큰 자동 갱신 + 온보딩 가드.
 * - 비로그인 사용자: 그대로 통과
 * - 로그인 + 약관 미동의: /signup
 * - 로그인 + 약관 동의 but birthdate NULL: /onboarding
 * - 면제 경로(/onboarding, /signup, /login, /auth/*, /api/*)는 가드 스킵
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  // ⚡ 빠른 경로 1a: 면제 경로는 supabase 호출 없이 통과
  if (ONBOARDING_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }
  // ⚡ 빠른 경로 1b: 정적 자산(이미지/폰트/스타일 등)은 redirect 안 함
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return response;
  }

  // ⚡ 빠른 경로 2: onboarded 쿠키가 있으면 supabase 호출 없이 통과
  //   (로그아웃 시 쿠키 expire되도록 별도 처리는 supabase logout이 onboarded 쿠키도 삭제할 때만 필요)
  const onboardedCookie = request.cookies.get(ONBOARDED_COOKIE)?.value;
  if (onboardedCookie) {
    return response;
  }

  // 위 fast path를 못 통과하면 supabase로 검증
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 → 가드 스킵
  if (!user) return response;

  // profiles 조회 — 약관 + birthdate 한번에 (실패 시 가드 스킵으로 fail-safe)
  let profile: { terms_agreed_at: string | null; birthdate: string | null } | null = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("terms_agreed_at, birthdate")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // DB 스키마 미적용 등 → 가드 스킵 (무한 redirect 방지)
      console.warn("[middleware] profile select error:", error.message);
      return response;
    }
    profile = data as { terms_agreed_at: string | null; birthdate: string | null } | null;
  } catch (e) {
    console.warn("[middleware] profile select exception:", e);
    return response;
  }

  // profile row 자체가 없으면 (handle_new_user 트리거 미적용 등) 가드 스킵
  if (!profile) return response;

  // 약관 미동의 → /signup
  if (!profile.terms_agreed_at) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  // 온보딩 강제 게이트 비활성화 — 모든 사용자가 갇히는 문제 회피.
  // birthdate NULL은 /me 배너로 자율적으로 안내, 글쓰기 시점에만 강제 (write/page.tsx 가드).
  // if (!profile.birthdate) {
  //   return NextResponse.redirect(new URL("/onboarding", request.url));
  // }

  // 통과 — 캐시 쿠키 set (12시간)
  response.cookies.set(ONBOARDED_COOKIE, user.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

// _next 정적 자원만 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
