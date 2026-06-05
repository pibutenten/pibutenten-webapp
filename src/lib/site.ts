/**
 * 사이트 URL 단일 진실 공급원 (Single Source of Truth).
 *
 * - production 빌드: NEXT_PUBLIC_SITE_URL 환경 변수 사용 (= https://pibutenten.kr)
 * - fallback: pibutenten-webapp.vercel.app (Preview 빌드 / 로컬 dev)
 *
 * 도메인 (pbtt.kr → pibutenten.kr 이전, 2026-05):
 *   - 메인: https://pibutenten.kr (가비아 등록)
 *   - 보조: https://www.pibutenten.kr → 308 redirect to apex
 *   - 레거시: https://pbtt.kr (영구 301 → pibutenten.kr, 폐기 안 함)
 *   - Vercel: https://pibutenten-webapp.vercel.app (Preview/내부용)
 *
 * 변경 절차:
 *   1) Vercel Project Environment Variables의 NEXT_PUBLIC_SITE_URL 수정 (Production만)
 *   2) 재배포하면 sitemap.xml / robots.txt / JSON-LD / canonical / OG URL 모두 자동 반영
 *   3) vercel.app·레거시 도메인 → canonical 301 은 next.config.ts 가 SITE_URL 기준 자동 처리
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://pibutenten-webapp.vercel.app";

/**
 * 시술 리포트 앵커(type=review_summary, /reports/{en})를 sitemap.xml·RSS 에 포함할지 여부.
 *
 * ★ON (2026-06-05, 원장 결정) — 리포트가 존재하는 시술(후기 ≥1)은 전부 검색엔진/AEO 색인.
 *   별도 후기 수 임계값 없음. sitemap/rss 쿼리는 status='published' 로 한 번 더 거르므로
 *   draft 앵커는 자동 제외(이중 게이트). 후기 0개로 리포트가 사라진 경우는
 *   /reports/[procedure] 가 getProcedureReport=null → robots:{index:false} 로 page 수준 차단.
 */
export const INCLUDE_REPORT_ANCHORS = true;

