/**
 * 사이트 URL 단일 진실 공급원 (Single Source of Truth).
 *
 * - production 빌드: NEXT_PUBLIC_SITE_URL 환경 변수 사용 (자체 도메인 이전 후 대응)
 * - fallback: pibutenten-webapp.vercel.app (현재 운영 도메인)
 *
 * 도메인 이전 시:
 *   1) Vercel Project Environment Variables에 NEXT_PUBLIC_SITE_URL=https://pibutenten.com 추가
 *   2) 재배포만 하면 sitemap.xml / robots.txt / JSON-LD / canonical / OG URL 모두 자동 반영
 *   3) vercel.app → pibutenten.com 301 redirect는 vercel.json 또는 next.config.ts에서 별도 설정
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://pibutenten-webapp.vercel.app";

/** 절대 URL 생성 헬퍼 — path는 / 로 시작 */
export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${cleaned}`;
}
