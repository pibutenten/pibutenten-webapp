import type { NextConfig } from "next";

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
  // 외부 이미지 도메인 허용 — YouTube 썸네일 (qas.external_image)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
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
  // vercel.app → pbtt.kr 영구 리다이렉트 (canonical 도메인 통일)
  // Preview 배포는 영향 받지 않음 (Production만 적용 — vercel host 매칭)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "pibutenten-webapp.vercel.app",
          },
        ],
        destination: "https://pbtt.kr/:path*",
        permanent: true,
      },
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
    //   - Naver Analytics: wcs.naver.net (script), wcs.naver.com (beacon)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://www.googletagmanager.com https://wcs.naver.net",
      "style-src 'self' 'unsafe-inline'",
      // PR-A E3 (2026-05-19): 끝의 `https:` 와일드카드 제거.
      // 이전엔 모든 HTTPS 이미지 도메인 허용 → CSP 무력화. Supabase Storage + YouTube 썸네일만 허용.
      // GA4 의 GIF beacon → google-analytics.com / googletagmanager.com 도 img-src 허용.
      `img-src 'self' data: blob: https://${supabaseHost} https://i.ytimg.com https://img.youtube.com https://www.google-analytics.com https://www.googletagmanager.com`,
      "font-src 'self' data:",
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://vitals.vercel-insights.com https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://wcs.naver.com`,
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
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
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
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
