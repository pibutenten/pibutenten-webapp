"use client";

/**
 * 클라이언트 측 활성 ID 읽기 헬퍼.
 *
 * Phase 9: 모든 ID = profiles row.
 *
 * 보안 (2026-05-16): 쿠키 2개 분리.
 *  - `pibutenten:identity`         — httpOnly. 서버 전용 (XSS 차단). JS 접근 불가.
 *  - `pibutenten:identity-mirror`  — httpOnly X. 클라 UI 표시 전용. 서버는 무시.
 * 클라이언트는 mirror만 읽으므로 XSS가 탈취해도 서버 위장 불가.
 *
 * 값:
 *  - 'primary' 또는 없음 → 로그인 profile 자체가 활성
 *  - UUID → 같은 auth_user_id 묶음 안의 다른 profile (예: doctor 부계정)
 *
 * 인터랙션(card_likes·card_saves·comments·card_shares) 시 author_id/user_id = 이 값.
 * 단 서버는 클라가 보낸 이 값 대신 자체 httpOnly 쿠키로 검증한다 (RPC 내부 또는 server fetch).
 */

import { IDENTITY_MIRROR_COOKIE, UUID_RE } from "./identity-shared";

const MIRROR_COOKIE = IDENTITY_MIRROR_COOKIE;

/**
 * 활성 profile.id (UUID) 반환.
 * - 'primary' 또는 cookie 없음 → null (= 로그인 profile 자체)
 * - UUID → 그 string
 */
export function getActiveIdentityId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${MIRROR_COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  const val = decodeURIComponent(match[1]);
  if (!val || val === "primary") return null;
  // UUID 검증 (identity-shared 공유 정규식)
  if (!UUID_RE.test(val)) return null;
  return val;
}
