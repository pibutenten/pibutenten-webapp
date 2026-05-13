"use client";

/**
 * 클라이언트 측 활성 ID 읽기 헬퍼.
 *
 * Phase 9: 모든 ID = profiles row. cookie `pibutenten:identity`에 target profile.id 저장.
 *  - 값 'primary' 또는 없음 → 로그인 profile 자체가 활성
 *  - 값 UUID → 같은 auth_user_id 묶음 안의 다른 profile (예: doctor 부계정)
 *
 * 인터랙션(qa_likes·qa_saves·comments) 시 author_id/user_id = 이 값.
 */

const COOKIE = "pibutenten:identity";

/**
 * 활성 profile.id (UUID) 반환.
 * - 'primary' 또는 cookie 없음 → null (= 로그인 profile 자체)
 * - UUID → 그 string
 */
export function getActiveIdentityId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  const val = decodeURIComponent(match[1]);
  if (!val || val === "primary") return null;
  // 단순 UUID 검증 (8-4-4-4-12)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
    return null;
  }
  return val;
}
