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
};

export default nextConfig;
