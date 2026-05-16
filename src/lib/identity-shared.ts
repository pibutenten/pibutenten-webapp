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

/**
 * 활성 identity 가 "primary"(=base profile)임을 의미하는 sentinel.
 * 매직 스트링 산재 방지 — 항상 이 상수 import.
 */
export const PRIMARY_IDENTITY_ID = "primary" as const;
export type PrimaryIdentityId = typeof PRIMARY_IDENTITY_ID;

/** UUID v4 형식 검증 (8-4-4-4-12) */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 같은 auth user 묶음 안의 profile 매칭 필터 (PostgREST `.or()` 인자).
 *
 * profiles 테이블에서 `id = authUserId` (base profile) 또는
 * `auth_user_id = authUserId` (sub profile)인 row 를 조회할 때 사용.
 *
 * 보안 (Phase 3 — defense-in-depth):
 *   주입값이 UUID 포맷이 아니면 즉시 Error throw —
 *   PostgREST `.or()` 가 string parsing 이라 향후 dynamic source 가
 *   유입되더라도 SQL injection 표면을 차단.
 */
export function bundleProfileFilter(authUserId: string): string {
  if (!UUID_RE.test(authUserId)) {
    throw new Error(
      `[bundleProfileFilter] invalid authUserId — expected UUID`,
    );
  }
  return `id.eq.${authUserId},auth_user_id.eq.${authUserId}`;
}

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
