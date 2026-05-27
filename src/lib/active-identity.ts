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
 * Critical-5 (2026-05-27) — sentinel "primary" 멸종:
 *   cookie 가 UUID 인 경우만 사용. 그 외 (옛 "primary" / 빈 값 / 비-UUID) → null 반환.
 *   호출자는 null 일 때 본 계정(auth.uid()) 으로 fallback.
 *
 * 인터랙션(card_likes·card_saves·comments·card_shares) 시 author_id/user_id = 이 값.
 * 단 서버는 클라가 보낸 이 값 대신 자체 httpOnly 쿠키로 검증한다 (RPC 내부 또는 server fetch).
 */

import { IDENTITY_MIRROR_COOKIE, UUID_RE } from "./identity-shared";

/**
 * 활성 profile.id (UUID) 반환.
 * - cookie 가 UUID → 그 string
 * - 그 외 (빈 값 / 옛 sentinel "primary" / 비-UUID) → null (호출자가 본 계정으로 fallback)
 */
export function getActiveIdentityId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${IDENTITY_MIRROR_COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  const val = decodeURIComponent(match[1]);
  if (!val) return null;
  // UUID 검증 — UUID 아닌 모든 값 (옛 sentinel "primary" 포함) 은 null.
  if (!UUID_RE.test(val)) return null;
  return val;
}
