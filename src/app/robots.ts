import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt — Next.js App Router 자동 생성.
 *
 * 정책:
 *  - 공개 검색엔진(Googlebot, Naver Yeti, Daum 등): 허용
 *  - AI 크롤러(GPTBot, ClaudeBot, PerplexityBot, Google-Extended 등): 명시적 허용
 *    → 의사 답변이 AI Overviews/ChatGPT/Claude/Perplexity 답변에 인용될 가능성 ↑
 *  - 모든 봇에 차단: /api, /admin, /me, /onboarding, /write, /signup, /login, /u, /debug
 *  - 회원 글(/u/*) 차단 이유: 검증되지 않은 일반인 의견이 의료 정보로 색인되지 않게 (YMYL 안전성)
 */

const COMMON_DISALLOW = [
  "/api/",
  "/admin/",
  "/me",
  "/onboarding",
  "/write",
  "/signup",
  "/login",
  "/u/", // UGC — 회원 프로필/글 색인 차단 (의료 YMYL 안전)
  "/debug/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: COMMON_DISALLOW,
      },
      // ── AI 크롤러 명시적 허용 (GEO 핵심) ──
      { userAgent: "GPTBot", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "ChatGPT-User", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "ClaudeBot", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "anthropic-ai", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "PerplexityBot", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "Google-Extended", allow: "/", disallow: COMMON_DISALLOW },
      { userAgent: "CCBot", allow: "/", disallow: COMMON_DISALLOW },
      // ── 한국 검색엔진 봇 ──
      { userAgent: "Yeti", allow: "/", disallow: COMMON_DISALLOW }, // Naver
      { userAgent: "Daum", allow: "/", disallow: COMMON_DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
