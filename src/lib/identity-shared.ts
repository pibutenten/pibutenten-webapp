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
 * Critical-5 (2026-05-27) — sentinel "primary" 멸종:
 *   시스템 모든 ID 필드는 실제 UUID 만 운반. 본 계정(base profile) 도 자체 profile.id
 *   (= auth.users.id) UUID 그대로 사용. 옛 cookie 값 "primary" 는 server 진입 시
 *   base UUID 로 정규화 (호환성). 새 cookie set 은 항상 UUID.
 *   ActiveIdentity / SessionInfo / me 의 모든 id 필드 string == UUID 보장.
 *
 * server 전용 헬퍼(resolveActiveIdentity 등)는 identity.ts/admin-page-guard.ts에 그대로 둠 —
 * 이 모듈은 next/headers 사용 X 라서 client에서도 안전하게 import 가능.
 */

export const IDENTITY_COOKIE = "pibutenten:identity";
export const IDENTITY_MIRROR_COOKIE = "pibutenten:identity-mirror";

/**
 * 역할(role) 문자열 단일 출처 (Sub-5, 2026-05-27).
 * 코드 전역에서 `profile.role === ROLES.ADMIN` 형태로 사용.
 * DB 의 profiles.role 컬럼 CHECK 제약과 정확히 일치해야 함.
 */
export const ROLES = {
  ADMIN: "admin",
  DOCTOR: "doctor",
  USER: "user",
} as const;

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
 * id, profileId 모두 항상 실제 UUID. 본 계정도 자체 profile.id (= auth.users.id) UUID.
 * Critical-5 (2026-05-27): 옛 sentinel "primary" 폐지.
 */
export type ActiveIdentity = {
  /** 활성 profile.id (UUID). 본 계정이면 authUserId 와 동일. */
  id: string;
  authUserId: string;
  profileId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** 'admin' | 'doctor' | 'user' */
  role: string;
  /** doctor_accounts 매핑 (없으면 null) */
  doctorId: string | null;
  /** 온보딩 게이트 — 미입력이면 null. resolveActiveIdentity 가 같은 SELECT 에서 동시 조회 (별도 쿼리 없음). */
  birthdate: string | null;
  termsAgreedAt: string | null;
};

/**
 * Active identity 로부터 권한 flag 도출.
 * isSuperAdmin / isDoctorAdmin 판별식이 identity.ts 와 admin-page-guard.ts 두 곳에
 * 중복 산재하던 것을 단일 헬퍼로 통합.
 */
export type IdentityFlags = {
  isSuperAdmin: boolean;
  isDoctorAdmin: boolean;
  activeDoctorId: string | null;
};

export function deriveIdentityFlags(active: ActiveIdentity | null): IdentityFlags {
  return {
    isSuperAdmin: active?.role === ROLES.ADMIN,
    isDoctorAdmin: !!active?.doctorId,
    activeDoctorId: active?.doctorId ?? null,
  };
}
