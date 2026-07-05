/**
 * route-class — 경로(pathname)의 "종류"를 판정하는 공용 헬퍼.
 *
 * WriteFab(글쓰기 FAB 노출 화이트리스트)·GlobalChrome(앱 셸 승격 판정) 등 여러 곳이
 * 같은 "이 경로가 글상세인가?" 판정을 중복 선언하던 것을 한곳으로 모은다.
 *
 * RESERVED_FIRST_SEGMENT 는 라우팅 분류 SSOT — middleware.ts 의 소프트 404 게이트도 이 집합을
 * 소비한다(실제 최상위 라우트는 존재 검사를 건너뛰고, 그 외 단일 세그먼트만 핸들 존재 조회 후 404).
 * 신규 최상위 라우트 추가 시 이 집합 + DB reserved_handles(마이그 0336)를 함께 갱신할 것.
 *
 * shortcode 검증은 lib/shortcode.ts 의 isValidShortcode 를 재사용(자체 정규식 신규 선언 금지).
 */

import { isValidShortcode } from "@/lib/shortcode";

/**
 * 회원 글상세 /{handle}/{shortcode} 의 첫 세그먼트가 핸들이 아닌 "예약 라우트"면 제외.
 *   (Next.js 정적 라우트가 우선이라 이 이름의 핸들은 실제 존재 불가하지만, pathname 만 보는
 *    클라이언트 판정에서 /admin/reports 같은 2세그 경로가 글상세로 오매칭되는 사고를 막는다.
 *    GlobalChrome 의 RESERVED_FIRST_SEGMENT 와 동일 목록.)
 */
export const RESERVED_FIRST_SEGMENT = new Set<string>([
  "admin", "api", "app", "auth", "cards", "doctor", "doctors", "topics", "reports",
  "reports-new", "review", "reviews", "settings", "u", "login", "signup", "onboarding", "write",
  "today", "notes", "weather",
  "my", "shop", "notifications", "search", "debug",
  "report", "rss", "about", "terms", "privacy", "contact",
  "disclaimer", "editorial-policy", "medical-review", "corrections",
  "disclosures", "doctor-guidelines",
]);

/**
 * 글상세 경로인지 판정한다.
 *   - 회원 글상세  /{handle}/{shortcode}        (2세그, 첫 세그 예약어 아님 + shortcode base58)
 *   - 의사 글상세  /doctors/{slug}/{year}/{post} (4세그, 첫 세그 "doctors")
 *
 * 의사 공개 프로필 /doctors/{slug}(2세그)·회원 공개 프로필 /{handle}(1세그)은 글상세가 아니므로 false.
 */
export function isPostDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const seg = pathname.split("/").filter(Boolean);

  // 의사 글상세 /doctors/{slug}/{year}/{postSlug} (4세그).
  if (seg.length === 4 && seg[0] === "doctors") return true;

  // 회원 글상세 /{handle}/{shortcode} (2세그, 첫 세그 예약어 아님 + shortcode base58).
  if (
    seg.length === 2 &&
    !RESERVED_FIRST_SEGMENT.has(seg[0]) &&
    isValidShortcode(seg[1])
  ) {
    return true;
  }

  return false;
}
