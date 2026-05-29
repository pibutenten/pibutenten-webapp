import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { IDENTITY_COOKIE } from "@/lib/identity-shared";

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
 * 첫 가입자 강제 온보딩 게이트 쿠키 — signup 완료 시 set.
 *  - 기존 가입자(birthdate NULL but 이 쿠키 없음)는 영향 없음
 *  - 신규 가입자는 onboarding 끝낼 때까지 다른 페이지 접근 X
 *  - onboarding 저장 시 클라이언트가 expire(Max-Age=0)
 */
const MUST_ONBOARD_COOKIE = "pibutenten_must_onboard";

/**
 * Phase 6-4 (2026-05-16): CSRF Origin 검증 — POST/PUT/PATCH/DELETE 등 unsafe method
 *   요청은 Origin/Referer 헤더가 우리 사이트와 같은지 확인. 다르면 403.
 *
 * - 면제: OAuth callback (외부 provider 가 redirect 로 보내는 POST 없음, 모두 GET)
 *         일부 webhook (예: Supabase Database Webhook → /api/push/send) — 이 경우는
 *         signed secret 검증으로 별도 방어되어 있으므로 Origin 검사를 면제할 수 있다.
 *         단, /api/push/send 의 timing-safe secret check 가 1차 방어선이므로 면제해도 안전.
 *
 * SameSite=Lax 쿠키만으로는 다음을 막지 못함:
 *   - 같은 사이트 서브도메인 공격 (예: malicious.pbtt.kr → pbtt.kr/api/me/delete)
 *   - 브라우저 확장의 fetch credentials:'include'
 * Origin/Referer 검사는 위 케이스 모두 차단.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Origin 검증 면제 API 경로 — webhook endpoints 등. */
const CSRF_EXEMPT_API_PREFIXES = [
  "/api/push/send", // Supabase Database Webhook (timing-safe secret 으로 별도 방어)
  "/api/auth/naver/callback", // Naver OAuth callback (POST 사용처 없음, GET only 라도 안전 측으로 포함)
];

/**
 * 허용되는 Origin 값. ADR 0012 정합 — 개인 LAN IP 하드코딩 폐기, 환경변수화.
 *
 *   - production 핵심 도메인 (https://pbtt.kr / www.pbtt.kr) — 모든 환경에서 허용
 *   - NEXT_PUBLIC_SITE_URL — 환경별 사이트 URL
 *   - CSRF_ALLOWED_ORIGINS — 콤마 구분 환경변수 (개발 LAN IP / 추가 도메인 등)
 *   - preview/development: pibutenten-webapp-*.vercel.app 패턴
 *   - dev: localhost / 127.0.0.1
 */

/** CSRF_ALLOWED_ORIGINS 환경변수 파싱 — 콤마 구분, 빈 값/공백 제거 */
function parseAllowedOrigins(): Set<string> {
  const raw = process.env.CSRF_ALLOWED_ORIGINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return new URL(s).origin;
        } catch {
          return s;
        }
      }),
  );
}
const ENV_ALLOWED_ORIGINS = parseAllowedOrigins();

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const vercelEnv = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development' | undefined
    const isDev = vercelEnv === "development" || !vercelEnv;
    const isPreview = vercelEnv === "preview";

    // production 핵심 도메인 — 모든 환경에서 허용 (운영 도메인은 빌드 환경 무관 신뢰).
    if (o.origin === "https://pbtt.kr") return true;
    if (o.origin === "https://www.pbtt.kr") return true;

    // NEXT_PUBLIC_SITE_URL — 환경마다 다르므로 매칭.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
      try {
        const site = new URL(siteUrl);
        if (o.origin === site.origin) return true;
      } catch (e) {
        // NEXT_PUBLIC_SITE_URL 이 잘못된 값이면 CSRF 화이트리스트가 비어
        // 모든 변이성 요청이 거절될 수 있음 — 운영 사고 가능성 있으므로 기록.
        const isDev = process.env.NODE_ENV !== "production";
        if (isDev) {
          console.warn("[csrf-origin] NEXT_PUBLIC_SITE_URL 파싱 실패:", e instanceof Error ? e.message : e);
        } else {
          console.error("[csrf-origin] NEXT_PUBLIC_SITE_URL 파싱 실패:", e instanceof Error ? e.message : e);
        }
      }
    }

    // CSRF_ALLOWED_ORIGINS 환경변수 (개발 LAN IP 등) — 모든 환경.
    if (ENV_ALLOWED_ORIGINS.has(o.origin)) return true;

    // preview/development: Vercel preview 도메인 — 프로젝트 prefix 로 좁힘.
    // production 빌드 환경에는 preview 도메인 허용 X (cross-origin 공격면 차단).
    if (isPreview || isDev) {
      if (
        o.hostname === "pibutenten-webapp.vercel.app" ||
        (o.hostname.startsWith("pibutenten-webapp-") &&
          o.hostname.endsWith(".vercel.app"))
      ) {
        return true;
      }
    }

    // dev only: localhost / 127.0.0.1 (개인 LAN IP 는 CSRF_ALLOWED_ORIGINS 로 주입)
    if (isDev) {
      if (o.hostname === "localhost" || o.hostname === "127.0.0.1") {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

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
  const method = request.method;

  // Phase 6-4: CSRF Origin 검증 — unsafe method 라우트만
  if (!SAFE_METHODS.has(method)) {
    const isExempt = CSRF_EXEMPT_API_PREFIXES.some((p) => path.startsWith(p));
    if (!isExempt) {
      const origin = request.headers.get("origin");
      // origin 헤더가 없는 일부 클라이언트(예: curl, 일부 브라우저 동일출처 fetch)는 referer 로 fallback
      const referer = request.headers.get("referer");
      let valid = false;
      if (origin) {
        valid = isAllowedOrigin(origin);
      } else if (referer) {
        try {
          const r = new URL(referer);
          valid = isAllowedOrigin(r.origin);
        } catch {
          valid = false;
        }
      }
      // origin 도 referer 도 없으면 차단 (브라우저는 unsafe method 시 둘 중 하나는 보냄)
      if (!valid) {
        return NextResponse.json(
          { error: "CSRF: origin mismatch" },
          { status: 403 },
        );
      }
    }
  }

  // ⚡ 빠른 경로 1a: 면제 경로는 supabase 호출 없이 통과
  if (ONBOARDING_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }
  // ⚡ 빠른 경로 1b: 정적 자산(이미지/폰트/스타일 등)은 redirect 안 함
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return response;
  }

  // ⚡ 빠른 경로 2a: 첫 가입 강제 온보딩 쿠키가 있으면 무조건 /onboarding으로
  //   supabase 호출 없이 즉시 redirect — fast path 우선
  const mustOnboardCookie = request.cookies.get(MUST_ONBOARD_COOKIE)?.value;
  if (mustOnboardCookie) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // ⚡ 빠른 경로 2b: onboarded 쿠키가 있으면 supabase 호출 없이 통과
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

  // 온보딩 강제 게이트 활성화 (2026-05-16 — 중복 가입자 식별 위해 모든 사용자 강제):
  // 신규/기존 무관, birthdate NULL이면 /onboarding 으로 redirect.
  // 온보딩 폼에서 이름·생년월일·성별을 받고 dedup 검사 → "이미 가입하셨나요?" 다이얼로그.
  if (!profile.birthdate) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // 통과 — 캐시 쿠키 set (12시간)
  // httpOnly: false — OnboardingClient.tsx 에서 document.cookie 로 같은 쿠키를 set 하므로 유지.
  // secure: production HTTPS 환경에서만 전송되도록 강제 (A11, 2026-05-17).
  response.cookies.set(ONBOARDED_COOKIE, user.id, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  // site_visits 적재 (0157, 2026-05-23) — 로그인 사용자 페이지 진입 추적.
  // 1일 1회 dedup: VISITED_COOKIE 가 있으면 skip. 없으면 INSERT + 24h 쿠키 set.
  // 카드 view/impression 이 없는 사용자(예: 알림에서 본인 카드 편집만)도 방문자로 카운트.
  // fail-safe — INSERT 실패해도 본 요청은 정상 처리.
  //
  // P1-④ (2026-05-29): user_id = active profile.id 로 전환 (ADR 0012 명함 단위 독립).
  //   IDENTITY_COOKIE 값이 UUID 면 그 active profile.id, "primary" 또는 없으면 base profile.id (= user.id).
  //   DB 조회 없이 쿠키만 읽음. KPI RPC (get_top_visitors_inner) 는 profiles.id JOIN 이라 자연 호환.
  //   과거 데이터는 base id 로 남아 있음 — 시점 기준 단절 (CHANGELOG 참조).
  const visitedCookie = request.cookies.get("pibutenten_visited")?.value;
  if (!visitedCookie) {
    const v = request.cookies.get(IDENTITY_COOKIE)?.value;
    const activeId = v && v !== "primary" ? v : user.id;
    try {
      await supabase.from("site_visits").insert({
        user_id: activeId,
        path,
      });
    } catch (e) {
      console.warn("[middleware] site_visits insert failed:", e);
    }
    response.cookies.set("pibutenten_visited", "1", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}

// _next 정적 자원만 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
