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
  serverExternalPackages: ["jsdom", "@mozilla/readability"],
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
};

export default nextConfig;
