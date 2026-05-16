/**
 * Identity 공유 모듈 — isomorphic (server + client).
 *
 * 정리 (2026-05-16): identity.ts / active-identity.ts / admin-page-guard.ts 세 곳에
 *   흩어져 있던 상수·정규식·타입을 단일 출처로 통합.
 *
 * 보안 모델 (migration 0097 후):
 *   IDENTITY_COOKIE        — httpOnly. 서버 전용 신뢰 (XSS 차단).
 *   IDENTITY_MIRROR_COOKIE — httpOnly X. 클라 UI 표시 전용 (서버는 무시).
 *   /api/identity/switch 가 항상 두 값 동시 set.
 *
 * server 전용 헬퍼(resolveActiveIdentity 등)는 identity.ts/admin-page-guard.ts에 그대로 둠 —
 * 이 모듈은 next/headers 사용 X 라서 client에서도 안전하게 import 가능.
 */

export const IDENTITY_COOKIE = "pibutenten:identity";
export const IDENTITY_MIRROR_COOKIE = "pibutenten:identity-mirror";

/** UUID v4 형식 검증 (8-4-4-4-12) */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Active identity 정보 (server 헬퍼 반환 타입).
 *
 * `id` 의미:
 *   "primary" = 본인 auth user 의 base profile (id = auth.uid())
 *   UUID      = 같은 묶음(auth_user_id) 안의 다른 profile
 *
 * profileId 는 항상 실제 UUID (= 행위 user_id / author_id 로 DB 저장).
 */
export type ActiveIdentity = {
  id: string | "primary";
  authUserId: string;
  profileId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 'admin' | 'doctor' | 'user' */
  role: string;
  /** doctor_accounts 매핑 (없으면 null) */
  doctorId: string | null;
};
