import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { IDENTITY_COOKIE, UUID_RE, HANDLE_RE } from "@/lib/identity-shared";
import { RESERVED_FIRST_SEGMENT } from "@/lib/route-class";
import { notFoundHtmlResponse } from "@/lib/not-found-response";

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
 * 최상위 실재 `.xml` 라우트 화이트리스트 (2026-07-05).
 *   존재하지 않는 최상위 `.xml`(예: /feed.xml)을 실제 404 로 돌려주되(소프트 404 차단),
 *   실재하는 최상위 `.xml`(sitemap 라우트 · rss.xml rewrite)은 그대로 통과시키기 위한 SSOT.
 *   `.xml` 만 이 예외 처리를 적용한다 — QA 가 지목한 미존재 자산 클래스가 /feed.xml 이고,
 *   실재 `.xml` 은 이 두 개로 한정되기 때문(그 외 확장자 .txt/.js/이미지 등은 STATIC_EXTENSIONS
 *   로 무조건 통과 — verification txt·llms·sw·로고 등 public 자산을 건드리지 않음).
 *   ⚠ 새 최상위 `.xml` 라우트를 신설하면 이 집합도 함께 갱신할 것(미갱신 시 그 자산이 404 로 가려짐).
 */
const REAL_ROOT_XML_PATHS = new Set<string>(["/sitemap.xml", "/rss.xml"]);

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
 *   - 같은 사이트 서브도메인 공격 (예: malicious.pibutenten.kr → pibutenten.kr/api/me/delete)
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
 *   - production 핵심 도메인 (pibutenten.kr / www + 레거시 pbtt.kr / www) — 모든 환경에서 허용
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
    //   신 도메인(pibutenten.kr) + 레거시(pbtt.kr) 모두 허용 — 도메인 이전 전환기 무중단.
    //   전환 완료 후 pbtt.kr 제거는 별도 안건 (당분간 301 대상으로 살아 있음).
    if (o.origin === "https://pibutenten.kr") return true;
    if (o.origin === "https://www.pibutenten.kr") return true;
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
export async function middleware(request: NextRequest, event: NextFetchEvent) {
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
  // ⚡ 빠른 경로 1b: 정적 자산(이미지/폰트/스타일 등)은 redirect 안 함.
  //   단, 존재하지 않는 최상위 `.xml`(예: /feed.xml)은 소프트 404 방지를 위해 실제 404 로 처리.
  //   실재 최상위 `.xml`(sitemap/rss) 및 그 외 모든 정적 확장자·하위 경로 자산은 그대로 통과.
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    if (
      (method === "GET" || method === "HEAD") &&
      path.endsWith(".xml") &&
      !path.slice(1).includes("/") && // 최상위 단일 세그먼트만(하위 경로 .xml 자산 보호)
      !REAL_ROOT_XML_PATHS.has(path)
    ) {
      return notFoundHtmlResponse();
    }
    return response;
  }

  // ⚡ 빠른 경로 1c: 시술 리포트 슬러그 처리 — (1) 영문 en → 한글 308 리다이렉트,
  //   (2) 존재하지 않는 시술 → 실제 404 (소프트 404 차단, 2026-07-05).
  //
  //   왜 미들웨어인가: /reports/[procedure] 는 force-dynamic 부모 layout(await RPC)이 만드는
  //     Suspense 경계 + route-level loading.tsx 아래에서 스트리밍되어, 페이지 본문의 notFound()
  //     시점엔 이미 200 이 확정된다(소프트 404). 존재 검사를 렌더 이전(미들웨어)에서 수행해야
  //     진짜 404 를 돌려줄 수 있다(Next.js 공식 권고). rewrite 로 not-found 를 렌더하면 루트
  //     app/loading.tsx 가 다시 Suspense 로 감싸 200 이 재발하므로, 미들웨어에서 404 Response 직접 반환.
  //
  //   정식 URL = /reports/{ko}(한글). 영문 en 은 리다이렉트 전용(중복 콘텐츠 방지).
  //   슬러그가 en 또는 ko 로 등록된 시술이면 통과(en 이면 308 로 ko 로 정규화), 어느 쪽으로도
  //     등록 안 됐으면 404. 한글 ko(정식 URL)도 이제 1회 조회한다 — 존재 검증에 필요(비용:
  //     시술 상세 진입당 인덱스 조회 1회. ko 는 UNIQUE 인덱스라 저렴).
  if (method === "GET" || method === "HEAD") {
    const reportMatch = path.match(/^\/reports\/([^/]+)\/?$/);
    if (reportMatch) {
      let slug: string;
      try {
        slug = decodeURIComponent(reportMatch[1]).trim();
      } catch {
        // malformed 퍼센트 인코딩(정상 클라는 항상 유효 인코딩) → garbage 입력이므로 실제 404
        //   (decodeURIComponent 는 try 밖에서 던지면 미들웨어 크래시=500 이 되므로 반드시 감쌈).
        return notFoundHtmlResponse();
      }
      // .or() 인젝션 방어: 아래 화이트리스트는 PostgREST 필터 메타문자(`,` `.` `(` `)`)를
      //   전부 배제한다 → 보간값이 새 조건·연산자를 만들 수 없다(공백은 연산자 구분자가 아니라
      //   `.` 없이는 조건 확장 불가 — 무해). 시술명(한글·영문·숫자·공백·하이픈·가운뎃점)만 조회 대상,
      //   그 외는 조회 없이 404. page.tsx 의 PROCEDURE_SLUG_RE 와 동일 기준(정규식 파리티 유지).
      if (slug && /^[가-힣a-zA-Z0-9 ·-]+$/.test(slug)) {
        const sb = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll: () => [], setAll: () => {} } },
        );
        // en(소문자) 또는 ko(원문) 로 등록된 시술 1건 조회 — page.tsx::resolveProcedure 와 동일 매칭.
        //   fail-open: 조회 예외/에러 시 404·리다이렉트로 단정하지 않고 통과(유효 시술 오404 차단).
        try {
          const { data, error } = await sb
            .from("tag_dictionary")
            .select("ko, en")
            .or(`en.eq.${slug.toLowerCase()},ko.eq.${slug}`)
            .eq("is_procedure", true)
            .maybeSingle<{ ko: string | null; en: string | null }>();
          const ko = data?.ko ?? null;
          if (!error && !ko) {
            // 조회 성공 + 어느 슬러그로도 미등록 → 실제 404(친절 안내 + noindex).
            return notFoundHtmlResponse();
          }
          if (ko && ko !== slug) {
            // 영문 en 진입 → 한글 ko 정식 URL 로 308 영구 리다이렉트(1홉, ko 는 비-ASCII 라 재진입 없음).
            return NextResponse.redirect(
              new URL(`/reports/${encodeURIComponent(ko)}`, request.url),
              308,
            );
          }
          // ko === slug(한글 정식 URL 직접 진입) 또는 이미 정합이면 반환 없이 통과 — 페이지가 렌더.
        } catch (e) {
          console.warn("[middleware] reports existence check exception:", e);
          // 통과 — 페이지가 처리(오404·리다이렉트 회피).
        }
      } else {
        // 빈 슬러그·메타문자 포함 등 형식 부적합 → 조회 없이 404.
        return notFoundHtmlResponse();
      }
    }
  }

  // ⚡ 빠른 경로 2a: 첫 가입 강제 온보딩 쿠키가 있으면 무조건 /onboarding으로
  //   supabase 호출 없이 즉시 redirect — fast path 우선
  const mustOnboardCookie = request.cookies.get(MUST_ONBOARD_COOKIE)?.value;
  if (mustOnboardCookie) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // ⚡ 빠른 경로 2b: onboarded 쿠키가 있으면 supabase 호출 없이 통과
  //   (로그아웃 시 쿠키 expire되도록 별도 처리는 supabase logout이 onboarded 쿠키도 삭제할 때만 필요)
  //
  // B-2 (2026-05-29 / POLICY-1): active 명함 단위로 매칭.
  //   IDENTITY_COOKIE 가 UUID (active 명함 명시) 이고 ONBOARDED_COOKIE 가 그 UUID 와 다르면
  //   active 가 바뀌었다는 신호 → fast path 통과 X, 슬로 path 로 검사.
  //   IDENTITY_COOKIE 가 없거나 옛 "primary" 면 옛 사용자 → 쿠키 있으면 그냥 통과.
  const onboardedCookie = request.cookies.get(ONBOARDED_COOKIE)?.value;
  const idCookieRaw = request.cookies.get(IDENTITY_COOKIE)?.value ?? null;
  const activeIdHint =
    idCookieRaw && idCookieRaw !== "primary" && UUID_RE.test(idCookieRaw)
      ? idCookieRaw
      : null;
  if (onboardedCookie) {
    if (!activeIdHint || onboardedCookie === activeIdHint) {
      return response;
    }
    // active 가 다른 명함으로 바뀜 → 슬로 path 에서 active 단위 재검사.
  }

  // ⚡ 빠른 경로 2c: 존재하지 않는 회원 핸들 → 실제 404 (소프트 404 차단, 2026-07-05).
  //   /{handle}(단일 세그먼트)은 [handle]/page.tsx 로 매칭되는데, 이 페이지도 스트리밍 경계
  //     아래에서 notFound() 를 부르므로 소프트 404(200)가 된다. 존재 검사를 미들웨어로 끌어올린다.
  //
  //   위치: onboarded 쿠키 빠른 경로(2b) '이후'. 온보딩 완료 회원(쿠키 보유)은 2b 에서 통과되어
  //     이 블록을 타지 않으므로 유효 핸들 방문에 DB 조회가 붙지 않는다(핫패스 비용 0). SEO 대상인
  //     크롤러·비로그인은 쿠키가 없어 2a/2b 를 지나 이 블록에 도달 → 미존재면 실제 404 를 받는다.
  //   오탐 방지: RESERVED_FIRST_SEGMENT(라우팅 분류 SSOT)에 있는 실제 최상위 라우트(/about,
  //     /doctors, /terms, /login, /reports … 및 홈 /)는 건너뛴다 — DB 조회 0, 회귀 0.
  //     실제 라우트가 아닌 단일 세그먼트만 후보. page.tsx 의 핸들 정규식과 동일 형식 게이트 →
  //     형식 부적합(예: feed.xml — '.' 포함)은 조회 없이 404.
  //   유효 판정: doctors.slug 또는 profiles.handle 중 하나라도 존재하면 통과([handle]/page.tsx 가
  //     의사 slug 는 /doctors 로 308, 회원 handle 은 프로필 렌더 — 둘 다 없을 때만 notFound()).
  //     (anon 은 명시 컬럼 SELECT — id·slug — 는 column GRANT 로 가능. table-wide SELECT 만 REVOKE.)
  //   fail-open: 조회 예외·에러 시 404 로 단정하지 않고 통과(유효 핸들을 일시 오류로 오404 차단).
  if (method === "GET" || method === "HEAD") {
    const seg = path.split("/").filter(Boolean);
    if (seg.length === 1) {
      let handle: string;
      try {
        handle = decodeURIComponent(seg[0]);
      } catch {
        // malformed 퍼센트 인코딩 → garbage 입력이므로 실제 404(미들웨어 크래시 방지).
        return notFoundHtmlResponse();
      }
      if (!RESERVED_FIRST_SEGMENT.has(handle)) {
        if (!HANDLE_RE.test(handle)) {
          // 핸들 형식 부적합(대문자·'.'·언더스코어·과길이 등)은 어떤 프로필도 될 수 없음 → 조회 없이 404.
          return notFoundHtmlResponse();
        }
        const sb = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll: () => [], setAll: () => {} } },
        );
        try {
          const [doctorRes, profileRes] = await Promise.all([
            sb.from("doctors").select("slug").eq("slug", handle).maybeSingle(),
            sb.from("profiles").select("id").eq("handle", handle).maybeSingle(),
          ]);
          const errored = !!doctorRes.error || !!profileRes.error;
          if (!errored && !doctorRes.data && !profileRes.data) {
            return notFoundHtmlResponse();
          }
        } catch (e) {
          console.warn("[middleware] handle existence check exception:", e);
          // 통과 — 페이지가 처리(오404 방지).
        }
      }
    }
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

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (e) {
    // 인증 엔드포인트 일시 장애 시 미처리 예외로 전 라우팅이 깨지지 않도록 가드 스킵 후 통과
    //   (아래 profiles 조회의 '에러 시 가드 스킵, 무한 redirect 방지' 철학과 동일).
    console.warn("[middleware] auth.getUser exception:", e);
    return response;
  }

  // 비로그인 → 가드 스킵
  if (!user) return response;

  // B-2 (2026-05-29 / ADR 0014 후속, POLICY-1): 온보딩 가드를 active 명함 단위로 검사.
  // 옛 패턴 (.eq("id", user.id)) 은 base profile 만 검사해 sub 명함의 PII NULL 을 놓쳤다 —
  // 사용자가 forbidden 토스트만 보고 온보딩 화면을 못 보던 회귀 원인.
  //
  // 보안 (묶음 우회 차단):
  //   IDENTITY_COOKIE 가 UUID 면 candidate. 그 UUID 가 호출자 묶음 (id = user.id 또는
  //   auth_user_id = user.id) 에 속할 때만 검사 대상으로 사용. 다른 사람 명함 ID 를
  //   쿠키에 넣어 우회 시도 → 묶음 검증 fail → base 로 fallback.
  //
  // 단일 쿼리: candidate 가 묶음 안에 있으면 그 row 의 PII 반환 (있으면 active 단위 검사).
  //           없으면 base (user.id) row 반환. 어느 쪽이든 정확히 1건.
  const idCookie = request.cookies.get(IDENTITY_COOKIE)?.value;
  const candidateId =
    idCookie && idCookie !== "primary" && UUID_RE.test(idCookie)
      ? idCookie
      : user.id;

  // H-1 (2026-07-04 Phase 1-B): birthdate 는 PII REVOKE 대상이라 여기서 직접 SELECT 하지
  //   않는다. terms_agreed_at·auth_user_id 는 비-PII 라 그대로 조회하고, 온보딩 게이트용
  //   birthdate 는 아래 get_onboarding_gate RPC(본인 전용)로 별도 조회한다.
  let profile: { id: string; terms_agreed_at: string | null } | null = null;
  try {
    // 1차: candidate 가 묶음 안인지 검증 + 비-PII 동시 조회.
    //   candidate == user.id (base) 면 자동 매칭. 다른 UUID 면 auth_user_id == user.id 검증.
    const { data, error } = await supabase
      .from("profiles")
      .select("id, terms_agreed_at, auth_user_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (error) {
      // DB 스키마 미적용 등 → 가드 스킵 (무한 redirect 방지)
      console.warn("[middleware] profile select error:", error.message);
      return response;
    }
    const row = data as
      | { id: string; terms_agreed_at: string | null; auth_user_id: string | null }
      | null;
    // 묶음 검증: candidate 가 base 와 같거나, auth_user_id 가 user.id 와 같으면 본인 묶음.
    const inBundle =
      !!row && (row.id === user.id || row.auth_user_id === user.id);
    if (inBundle) {
      profile = {
        id: row.id,
        terms_agreed_at: row.terms_agreed_at,
      };
    }
  } catch (e) {
    console.warn("[middleware] profile select exception:", e);
    return response;
  }

  // candidate 가 묶음 외였거나 SELECT 실패 → base profile 로 fallback.
  if (!profile) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, terms_agreed_at")
        .eq("id", user.id)
        .maybeSingle();
      profile = data as { id: string; terms_agreed_at: string | null } | null;
    } catch (e) {
      console.warn("[middleware] base fallback select exception:", e);
      return response;
    }
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
  //
  // H-1 (2026-07-04 Phase 1-B): birthdate 는 본인 전용 게이트 RPC 로 조회(PII SELECT 회피).
  //   ⚠ fail-CLOSED: RPC 실패·birthdate NULL 이면 /onboarding 으로 보낸다(옛 fail-open =
  //   미온보딩 사용자가 게이트를 통과하던 보안 역행 차단). /onboarding 은 면제 경로라 루프 없음.
  let gateBirthdate: string | null = null;
  try {
    const { data: gate, error: gateErr } = await supabase
      .rpc("get_onboarding_gate", { p_target: profile.id })
      .maybeSingle<{ birthdate: string | null; terms_agreed_at: string | null }>();
    if (gateErr) {
      console.warn("[middleware] onboarding gate RPC error:", gateErr.message);
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    gateBirthdate = gate?.birthdate ?? null;
  } catch (e) {
    console.warn("[middleware] onboarding gate RPC exception:", e);
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (!gateBirthdate) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // 통과 — 캐시 쿠키 set (12시간)
  // httpOnly: false — OnboardingClient.tsx 에서 document.cookie 로 같은 쿠키를 set 하므로 유지.
  // secure: production HTTPS 환경에서만 전송되도록 강제 (A11, 2026-05-17).
  //
  // B-2 (2026-05-29): 쿠키 값을 검사 통과한 명함 ID 로 set (옛 user.id 고정 → profile.id).
  //   active 명함 바뀌면 fast path 가 mismatch 감지 → 재검사 트리거.
  response.cookies.set(ONBOARDED_COOKIE, profile.id, {
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
  // P1-④ (2026-05-29): profile_id = active profile.id 로 전환 (ADR 0012 명함 단위 독립).
  //   ADR 0014 Phase 2 (마이그 0186): site_visits.user_id → profile_id RENAME.
  //   IDENTITY_COOKIE 값이 UUID 면 그 active profile.id, "primary" 또는 없으면 base profile.id (= user.id).
  //   DB 조회 없이 쿠키만 읽음. KPI RPC (get_top_visitors_inner) 는 profiles.id JOIN 이라 자연 호환.
  //   과거 데이터는 base id 로 남아 있음 — 시점 기준 단절 (CHANGELOG 참조).
  const visitedCookie = request.cookies.get("pibutenten_visited")?.value;
  if (!visitedCookie) {
    // 위(217)에서 이미 UUID_RE 로 검증한 activeIdHint 재사용 — 비-UUID/없음/"primary" 면 null
    //   → user.id (base profile.id) 로 안전 폴백. raw 쿠키 직접 INSERT 로 인한 타입에러 방문
    //   누락·KPI 오염 방지. (묶음 소속 검증은 핫패스 쿼리 회피 위해 별도 백로그.)
    const activeId = activeIdHint ?? user.id;
    // 비블로킹 적재 — best-effort KPI 이므로 응답 경로를 막지 않는다.
    //   event.waitUntil 로 등록: Edge 런타임에서 응답 반환 후에도 백그라운드 작업이
    //   잘리지 않고 완료되도록 보장 (단순 floating promise 는 응답 후 종료되며 잘릴 수 있음).
    //   INSERT 실패는 조용히 흡수 — 사용자 요청을 절대 깨지 않는다.
    event.waitUntil(
      Promise.resolve(
        supabase.from("site_visits").insert({
          profile_id: activeId,
          path,
        }),
      ).then(
        () => {},
        (e) => {
          console.warn("[middleware] site_visits insert failed:", e);
        },
      ),
    );
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
