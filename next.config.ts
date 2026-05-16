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
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://${supabaseHost} https://i.ytimg.com https://img.youtube.com https:`,
      "font-src 'self' data:",
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://vitals.vercel-insights.com`,
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
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
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          { key: cspKey, value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
