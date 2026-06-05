import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// SITE_PUBLIC env 변경을 매 요청에서 반영하기 위해 dynamic 강제.
// Vercel build cache 가 robots 산출물을 재사용해 fail-safe 응답이 잔존하는 회귀 차단.
export const dynamic = "force-dynamic";

/**
 * robots.txt — Next.js App Router 자동 생성.
 *
 * 정책 (2026-05-28):
 *  - HOLD 모드: `SITE_PUBLIC !== "true"` 이면 fail-safe 전체 차단.
 *    공개는 운영자가 Vercel 환경변수에 `SITE_PUBLIC=true` 추가 후 redeploy.
 *    락다운 중에는 sitemap URL 도 노출하지 않음 (크롤러 색인 시도 자체 회피).
 *  - 공개 모드: 3-tier AI 크롤러 정책 (학습 차단 / 검색·답변 허용 / 일반 검색 허용).
 *
 *  [Tier 1] 검색엔진 — Allow
 *    Googlebot / Yeti (Naver) / Bingbot / DuckDuckBot / Daumoa / YandexBot
 *
 *  [Tier 2] AI 검색·답변 봇 — Allow
 *    답변에 인용 + 출처 링크 환원.
 *    OAI-SearchBot / ChatGPT-User / Claude-SearchBot / Claude-User /
 *    PerplexityBot / Perplexity-User
 *
 *  [Tier 3] AI 학습 봇 — Disallow
 *    모델 학습 데이터 흡수만 하고 환원 없음 → 참여 전문의 권리 보호.
 *    GPTBot / ClaudeBot / CCBot / Google-Extended / Bytespider /
 *    Applebot-Extended / Meta-ExternalAgent / Amazonbot /
 *    anthropic-ai / Diffbot / Omgilibot / cohere-ai / ImagesiftBot
 *
 *  Disallow 공통 경로 (모든 봇):
 *    /api/  /admin/  /auth/  /onboarding  /signup  /login
 *    /write  /notifications  /settings  /report$
 *    /search?  /debug  /u/
 *
 *  ⚠️ 접두 매칭 주의:
 *    /doctor (단수) 를 Disallow 하면 /doctors/* · /doctor-guidelines 까지 차단됨.
 *    /me 를 Disallow 하면 /medical-review 까지 차단됨.
 *    /report (단수 신고 페이지) 를 Disallow 하면 /reports/* (시술 리포트, 색인 대상) 까지 차단됨
 *      → "$" 종단 앵커(/report$)로 단수 페이지만 정확 매칭(2026-06-05 색인 ON).
 *    → 위 doctor/me 경로는 공통 Disallow 에 넣지 않음. 페이지 자체가 인증 필요 (auth gate)
 *      또는 generateMetadata 의 robots:{index:false} 로 page 수준 차단.
 *
 *  회원 글 `/{handle}/{shortcode}` 처리:
 *    robots 차원에서 handle 패턴 직접 차단 불가 (와일드카드 한계).
 *    각 페이지 generateMetadata 의 robots:{index:false,follow:true} 로 차단 (현 정책 유지).
 *
 *  ※ robots.txt 는 권고. 강제 차단은 Vercel Firewall (Bytespider 등) 별도 적용 권장.
 */

const DISALLOW_COMMON = [
  "/api/",
  "/admin/",
  "/auth/",
  "/onboarding",
  "/signup",
  "/login",
  "/write",
  "/notifications",
  "/settings",
  // 단수 신고 페이지만 차단. "$" 종단 앵커로 /reports/* (시술 리포트, 색인 대상) 접두 매칭 방지.
  "/report$",
  "/search?",
  "/debug",
  "/u/",
];

const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "anthropic-ai",
  "Diffbot",
  "Omgilibot",
  "cohere-ai",
  "ImagesiftBot",
];

const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];

const SEARCH_ENGINES = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Yeti",
  "Bingbot",
  "DuckDuckBot",
  "Daumoa",
  "YandexBot",
];

export default function robots(): MetadataRoute.Robots {
  // HOLD 모드 — fail-safe 전체 차단. SITE_PUBLIC=true 일 때만 공개 정책 적용.
  if (process.env.SITE_PUBLIC !== "true") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      host: SITE_URL,
      // sitemap URL 의도적으로 노출 안 함 (락다운 중 크롤러 색인 회피).
    };
  }

  return {
    rules: [
      ...SEARCH_ENGINES.map((ua) => ({
        userAgent: ua,
        allow: "/",
        disallow: DISALLOW_COMMON,
      })),
      ...AI_SEARCH_BOTS.map((ua) => ({
        userAgent: ua,
        allow: "/",
        disallow: DISALLOW_COMMON,
      })),
      ...AI_TRAINING_BOTS.map((ua) => ({
        userAgent: ua,
        disallow: "/",
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_COMMON,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
