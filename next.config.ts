import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * URL 정책 (v3 spec):
   *  - /            — 메인 피드
   *  - /search      — 검색 (영구 noindex)
   *  - /feed        — 301 redirect → / (옛 북마크/외부 링크 보존)
   *  - /doctors/{slug} — 의사 프로필
   *  - /doctors/{slug}/{year}/{post-slug} — 의사 글 canonical
   *  - /qa/{id}     — 외부 공유 fallback
   */
  async redirects() {
    return [
      {
        source: "/feed",
        destination: "/",
        permanent: true, // 301
      },
    ];
  },
  // Server-only Node 라이브러리 — webpack 번들링 X (Next 15+)
  // jsdom·readability는 Node 환경에서만 동작 + native 의존성 있어 외부로 처리.
  serverExternalPackages: ["jsdom", "@mozilla/readability"],
};

export default nextConfig;
