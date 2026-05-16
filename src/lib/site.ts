/**
 * 사이트 URL 단일 진실 공급원 (Single Source of Truth).
 *
 * - production 빌드: NEXT_PUBLIC_SITE_URL 환경 변수 사용 (= https://pbtt.kr)
 * - fallback: pibutenten-webapp.vercel.app (Preview 빌드 / 로컬 dev)
 *
 * 도메인:
 *   - 메인: https://pbtt.kr (가비아 등록, 2026-05-13 연결)
 *   - 보조: https://www.pbtt.kr → 308 redirect to apex
 *   - Vercel: https://pibutenten-webapp.vercel.app (Preview/내부용)
 *
 * 변경 절차:
 *   1) Vercel Project Environment Variables의 NEXT_PUBLIC_SITE_URL 수정 (Production만)
 *   2) 재배포하면 sitemap.xml / robots.txt / JSON-LD / canonical / OG URL 모두 자동 반영
 *   3) vercel.app → pbtt.kr 301 redirect는 vercel.json 또는 next.config.ts에서 별도 설정
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://pibutenten-webapp.vercel.app";

// (absoluteUrl 폐기됨 — `${SITE_URL}${path}` 인라인으로 충분, 호출처 0건이었음)
