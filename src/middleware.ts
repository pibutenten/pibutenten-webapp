import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth 토큰 자동 갱신 미들웨어.
 * 모든 페이지 요청에 대해 cookies를 새로고침해서
 * Server Component에서 user.getUser()가 최신 세션을 읽을 수 있게 함.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  // 토큰 갱신 트리거 (호출만 해도 내부에서 cookies 업데이트)
  await supabase.auth.getUser();

  return response;
}

// 정적 자원 제외, 그 외 모든 라우트 적용
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|og.png|manifest.webmanifest|doctors/.*\\.(?:png|jpg|jpeg|webp)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
