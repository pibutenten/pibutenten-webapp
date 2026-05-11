"use client";

/**
 * 클라이언트 측 활성 identity 읽기 헬퍼.
 *
 * 활성 identity는 cookie `pibutenten:identity`에 저장됨.
 *  - 값 'primary' 또는 없음: 1차 identity (= profile 자체). identity_id는 NULL로 저장.
 *  - 값 UUID: profile_identities row id. 인터랙션(qa_likes·qa_saves·comments) 시
 *    identity_id 컬럼에 그 UUID를 함께 저장 → 멀티 identity 카운팅/표시 정확화.
 */

const COOKIE = "pibutenten:identity";

/**
 * 활성 identity_id (UUID) 반환.
 * - 'primary' 또는 cookie 없음 → null (= profile 자체 = 1차 identity)
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
