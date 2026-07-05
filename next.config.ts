import type { NextConfig } from "next";

/**
 * 동작용 canonical 도메인 — SSOT (NEXT_PUBLIC_SITE_URL 단일 출처, src/lib/site.ts 와 동일 규칙).
 * 도메인 이전(pbtt.kr → pibutenten.kr) 후에도 이 한 곳(env)만 보고 동작하도록 하드코딩 제거.
 *  - production: NEXT_PUBLIC_SITE_URL = https://pbtt.kr (전환 전) / https://pibutenten.kr (전환 후)
 *  - env 미설정(preview/local): 신 도메인 기본값.
 */
const CANONICAL_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://pibutenten.kr";
const CANONICAL_HOST = CANONICAL_ORIGIN.replace(/^https?:\/\//, "");

/**
 * 레거시 도메인 → canonical 301 활성화 게이트.
 *  ⚠ canonical 이 pibutenten.kr 일 때만(= A-2 env 플립 후) true → pbtt.kr 301 활성화.
 *    전환 전(NEXT_PUBLIC_SITE_URL=pbtt.kr)에는 코드에 있어도 비활성 →
 *    "모든 추가 끝나기 전 전환 금지" 게이트를 코드 차원에서 보장. 깃발은 env 플립이 넘긴다.
 */
const IS_NEW_DOMAIN = CANONICAL_HOST === "pibutenten.kr";

const nextConfig: NextConfig = {
  /**
   * URL 정책 (v5.1 spec):
   *  - /                                       — 메인 피드
   *  - /search                                 — 검색 (영구 noindex)
   *  - /doctors/{slug}                         — 의사 프로필
   *  - /doctors/{slug}/{year}/{post-slug}      — 의사 글 canonical (year 유지)
   *  - /{handle}/{shortcode}                   — 회원 글 (year 제거)
   *  - /{handle}                               — 회원/원장 프로필
   *
   * /qa/* /feed/* 라우트는 폐기 (사용자 결정 — 잔존 redirect 모두 제거).
   */
  // Server-only Node 라이브러리 — webpack 번들링 X (Next 15+)
  // jsdom·readability는 Node 환경에서만 동작 + native 의존성 있어 외부로 처리.
  // sharp (Phase 6-6) — libvips native 바인딩, 서버 사이드 이미지 처리 (EXIF 제거 + 리사이즈)
  serverExternalPackages: ["jsdom", "@mozilla/readability", "sharp"],
  // next/image 최적화 허용 도메인.
  //  - YouTube 썸네일 (qas.external_image): i.ytimg.com / img.youtube.com
  //  - Supabase Storage (회원 업로드 아바타·이미지): NEXT_PUBLIC_SUPABASE_URL 호스트.
  //      production = Custom Domain auth.pibutenten.kr (ADR 0018, storage 까지 프록시),
  //      로컬·preview = <ref>.supabase.co. env 에서 호스트만 추출해 단일 출처로 등록.
  //      ⚠ 카카오·구글·네이버 OAuth 아바타(k.kakaocdn.net / pstatic.net / googleusercontent.com 등)는
  //        임의 외부 도메인이라 여기 등록하지 않음 → CardAvatar 가 그 케이스만 unoptimized 로 처리.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      ...(() => {
        const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
          ?.replace(/^https?:\/\//, "")
          ?.replace(/\/$/, "");
        return supabaseHost
          ? [
              {
                protocol: "https" as const,
                hostname: supabaseHost,
                pathname: "/storage/v1/object/public/**",
              },
            ]
          : [];
      })(),
    ],
  },
  // /rss.xml URL → /rss 라우트 매핑.
  // 사유: Next.js 의 dot-in-path 라우트 폴더 (app/rss.xml/) 가 production 에서
  //   정적 fallback 으로 잘못 매칭되어 HTML 페이지가 응답되는 회귀가 있었음.
  //   라우트 폴더를 app/rss/ 로 옮기고 외부 노출 URL 만 /rss.xml 로 유지.
  async rewrites() {
    return [
      { source: "/rss.xml", destination: "/rss" },
    ];
  },
  // vercel.app → canonical 영구 리다이렉트 (canonical 도메인 통일, SITE_URL 기반)
  // Preview 배포는 영향 받지 않음 (Production만 적용 — vercel host 매칭)
  async redirects() {
    return [
      // /beta 미리보기 라우트 → 메인 승격(2026-06-11). 새 앱이 루트로 이전됨 → 영구 308.
      //   쿼리(?q=, ?tab=)는 Next 가 자동 보존 → /beta?q=x → /?q=x.
      //   bare /beta → /, 그 외 모든 /beta/* 하위 경로는 와일드카드로 대응 경로에 매핑(잔여 URL 안전망).
      { source: "/beta", destination: "/", permanent: true },
      { source: "/beta/:path*", destination: "/:path*", permanent: true },
      // /search 완전 폐기(2026-06-12). 검색은 루트 /?q= 가 담당 → 308(쿼리 보존: /search?q=x → /?q=x).
      { source: "/search", destination: "/", permanent: true },
      // /topics 는 검색·AI 유입 전용 밸브(인덱스 라우트 없음) — 직접 진입은 홈으로.
      { source: "/topics", destination: "/", permanent: true },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "pibutenten-webapp.vercel.app",
          },
        ],
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      },
      // 레거시 도메인 pbtt.kr / www.pbtt.kr → canonical(pibutenten.kr) 301 (경로 보존).
      //   ⚠ env 플립(A-2) 후에만 활성화 (IS_NEW_DOMAIN). 전환 전엔 빈 배열 → 비활성.
      ...(IS_NEW_DOMAIN
        ? [
            {
              source: "/:path*",
              has: [{ type: "host" as const, value: "pbtt.kr" }],
              destination: `${CANONICAL_ORIGIN}/:path*`,
              permanent: true,
            },
            {
              source: "/:path*",
              has: [{ type: "host" as const, value: "www.pbtt.kr" }],
              destination: `${CANONICAL_ORIGIN}/:path*`,
              permanent: true,
            },
          ]
        : []),
      // 의사 글 slug 교정 (2026-05-30): 옛 영상ID-인덱스 slug → 키워드 slug 301.
      //   발행됐던(published) 8건만 SEO 자산 보존용으로 301. 검수중 13건은 미노출이라 불필요.
      //   생성 로직은 publish/route.ts 에서 키워드 slug 로 수정 완료 (재발 방지).
      { source: "/doctors/park-hyojin/2026/U42sb6TMu5c-1", destination: "/doctors/park-hyojin/2026/pre-event-skin-prep", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-1", destination: "/doctors/jung-hanmi/2026/rejuran-ineffective-reason", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-2", destination: "/doctors/jung-hanmi/2026/skin-booster-sebum-hydration", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-4", destination: "/doctors/jung-hanmi/2026/sculptra-nasolabial-fold", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-5", destination: "/doctors/jung-hanmi/2026/alltite-rf-thick-skin", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-6", destination: "/doctors/jung-hanmi/2026/ultherapy-botox-treatment-order", statusCode: 301 },
      { source: "/doctors/jung-hanmi/2026/gmTaKoFiZn0-7", destination: "/doctors/jung-hanmi/2026/re2o-cadaver-safety", statusCode: 301 },
      { source: "/doctors/rhee-doyoung/2026/vB7Bk87M6Ro-4", destination: "/doctors/rhee-doyoung/2026/rejuran-vs-re2o-comparison", statusCode: 301 },
    ];
  },
  /**
   * Security Headers.
   *
   * 적용 대상: 모든 라우트.
   *
   * CSP 정책 (2026-05-17 — Report-Only 유지):
   *   - production / development 모두 `Content-Security-Policy-Report-Only`
   *   - 결정 사유: enforce 시 GoogleBot 이 CSP 로 차단된 리소스를 못 읽어 SEO 풍부도 영향 가능성.
   *     SEO 우선 정책이라 enforce 미적용. 위반 로그는 계속 수집됨.
   *
   * 화이트리스트 도메인:
   *  - script-src: 'self' + 'unsafe-inline' (JSON-LD) + 'unsafe-eval' (Turbopack)
   *  - connect-src: Supabase + Vercel Analytics
   *  - frame-src: YouTube (영상 임베드)
   *  - img-src: Supabase Storage + YouTube 썸네일
   *  - frame-ancestors: 'none' (클릭재킹 방어 — Report-Only 라도 X-Frame-Options 가 enforce)
   */
  async headers() {
    const supabaseHost =
      process.env.NEXT_PUBLIC_SUPABASE_URL
        ?.replace(/^https?:\/\//, "")
        ?.replace(/\/$/, "") || "*.supabase.co";
    // Analytics 도메인 (2026-05-28 추가):
    //   - Vercel Analytics/Speed Insights: va.vercel-scripts.com (script), vitals.vercel-insights.com (beacon)
    //   - GA4: www.googletagmanager.com (gtag script + measurement beacon),
    //          *.google-analytics.com / *.analytics.google.com (beacon)
    //   - Naver Analytics: wcs.pstatic.net (script CDN), wcs.naver.com (beacon)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://www.googletagmanager.com https://wcs.pstatic.net https://oapi.map.naver.com",
      "style-src 'self' 'unsafe-inline'",
      // PR-A E3 (2026-05-19): 끝의 `https:` 와일드카드 제거.
      // 이전엔 모든 HTTPS 이미지 도메인 허용 → CSP 무력화. Supabase Storage + YouTube 썸네일만 허용.
      // GA4 의 GIF beacon → google-analytics.com / googletagmanager.com 도 img-src 허용.
      `img-src 'self' data: blob: https://${supabaseHost} https://i.ytimg.com https://img.youtube.com https://www.google-analytics.com https://www.googletagmanager.com https://oapi.map.naver.com https://*.map.naver.com https://*.map.naver.net https://*.pstatic.net`,
      "font-src 'self' data:",
      // 피부날씨(투데이/상세) 클라이언트 직접 호출: Open-Meteo(예보·대기질) + BigDataCloud(역지오코딩).
      //   ADR: 무료 per-IP 제한 API 라 서버 프록시 대신 클라 직접 호출(공유 egress IP 한도 회피, 2026-06-24 사고 환원).
      //   현재 CSP 는 Report-Only 라 누락돼도 차단은 안 됐으나, enforce 전환 대비 + 위반 로그 노이즈 제거 위해 명시(2026-06-29).
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://vitals.vercel-insights.com https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://wcs.naver.com https://oapi.map.naver.com https://*.map.naver.com https://*.map.naver.net https://*.pstatic.net https://api.open-meteo.com https://air-quality-api.open-meteo.com https://api.bigdatacloud.net`,
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      // 2026-05-28: CSP 위반 보고 endpoint — /api/csp-report
      // report-uri 는 구 사양, report-to 는 신 사양(CSP Level 3). 호환 위해 병기.
      "report-uri /api/csp-report",
      "report-to default",
    ].join("; ");
    // Report-To 헤더 — CSP Level 3 신 사양. /api/csp-report 가 위반 보고 수신.
    const reportTo = JSON.stringify({
      group: "default",
      max_age: 10886400,
      endpoints: [{ url: "/api/csp-report" }],
    });
    // Report-Only 유지 (SEO 우선 정책).
    const cspKey = "Content-Security-Policy-Report-Only";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // 2026-05-28: Permissions-Policy 확장 — payment/usb/interest-cohort/browsing-topics
          // (FLoC/Topics API 거부 + 결제·USB 권한 0 — pibutenten 미사용 기능)
          // 2026-06-08: geolocation=(self) — 시술일기 '내 주변 피부과 찾기'(1st-party)만 허용.
          //   외부 iframe 은 계속 차단. mic/camera 는 미사용이라 () 유지.
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(self), microphone=(), camera=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
          },
          // 2026-05-28: Cross-Origin-* 헤더 — 사이트 isolation 강화
          // CORP same-origin 은 정적 자산 (fonts/icons/og) 의 vercel.json 별도 cross-origin 으로 override 됨.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // 2026-05-28: Report-To — CSP 위반 보고 endpoint 그룹 정의
          { key: "Report-To", value: reportTo },
          { key: cspKey, value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
