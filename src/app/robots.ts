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
 *  - 공개 모드: 2-tier 크롤러 정책 (인용·도달 최대화 — 2026-06-06).
 *    인용 경로는 이미 열려 있고 보호할 IP 가 적어, 주요 AI 학습봇도 허용해
 *    브랜드 도달(글로벌 포함)을 넓힌다. 순수 스크래퍼만 차단.
 *
 *  [Tier 1] 검색 + AI 인용 + 주요 학습봇 — Allow (운영 경로만 제외)
 *    검색: Googlebot / Bingbot / Yeti(Naver) / Daumoa / DuckDuckBot / YandexBot
 *    AI 인용: OAI-SearchBot / ChatGPT-User / Claude-SearchBot / Claude-User /
 *            PerplexityBot / Perplexity-User
 *    학습: GPTBot / ClaudeBot / anthropic-ai / CCBot / Google-Extended /
 *          Applebot-Extended / Meta-ExternalAgent / Amazonbot / cohere-ai
 *
 *  [Tier 2] 저가치 순수 스크래퍼 — Disallow: /
 *    Bytespider / Diffbot / Omgilibot / ImagesiftBot
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
 *  ※ robots.txt 는 권고일 뿐. 운영자 결정(2026-06-06): Vercel Firewall 강제 차단
 *    미적용 — 권고 수준으로 충분(보호할 IP 적음). Bytespider 등이 robots 무시하는 건 감수.
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

// Tier 1 — 검색엔진 + AI 인용봇 + 주요 학습봇 (Allow, 운영 경로만 제외).
//   인용·도달 최대화 결정 (2026-06-06): 주요 AI 학습봇도 허용 (cohere-ai·Amazonbot 포함).
const TIER1_ALLOWED = [
  // 검색엔진
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Bingbot",
  "Yeti",
  "Daumoa",
  "DuckDuckBot",
  "YandexBot",
  // AI 검색·인용봇
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  // 주요 AI 학습봇 (인용·도달 표면)
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "cohere-ai",
];

// Tier 2 — 저가치 순수 스크래퍼만 차단 (Disallow: /).
const TIER2_BLOCKED = ["Bytespider", "Diffbot", "Omgilibot", "ImagesiftBot"];

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
      // Tier 1 — 검색 + AI 인용 + 주요 학습봇: 한 블록(userAgent 배열)으로 그룹화.
      {
        userAgent: TIER1_ALLOWED,
        allow: "/",
        disallow: DISALLOW_COMMON,
      },
      // Tier 2 — 저가치 순수 스크래퍼만 전면 차단.
      {
        userAgent: TIER2_BLOCKED,
        disallow: "/",
      },
      // 그 외 전부 (미래 신규 AI 검색봇 포함) 기본 허용 — 운영 경로만 제외.
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
