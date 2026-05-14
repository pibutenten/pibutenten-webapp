import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt — Next.js App Router 자동 생성.
 *
 * 정책:
 *  - 공개 검색엔진(Googlebot, Naver Yeti, Daum 등): 허용
 *  - AI 크롤러(GPTBot, ClaudeBot, PerplexityBot, Google-Extended 등): 명시적 허용
 *    → 의사 답변이 AI Overviews/ChatGPT/Claude/Perplexity 답변에 인용될 가능성 ↑
 *  - 모든 봇에 차단: /api, /admin, /settings, /notifications, /onboarding, /write, /signup, /login, /u/, /debug, /search
 *  - 회원 글(/{handle}/{shortcode}) 자체는 페이지 레벨 metadata noindex 처리
 *    (robots.txt는 가변 핸들 패턴 지정 불가 — 메타태그로 YMYL 안전성 보장)
 */

const COMMON_DISALLOW = [
  "/api/",
  "/admin/",
  "/settings",
  "/notifications",
  "/onboarding",
  "/write",
  "/signup",
  "/login",
  "/u/", // legacy /u/[id] 폐기 경로 — 안전 차단
  "/debug/",
  "/search", // 검색 결과는 영구 noindex (page level)
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
