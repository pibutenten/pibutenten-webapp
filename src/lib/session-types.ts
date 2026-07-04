/**
 * 세션 타입 SSOT — SessionInfo / SessionIdentity.
 *
 * 구 `components/TopNav.tsx` 에 정의돼 있던 것을, TopNav/BottomNav 삭제(앱셸 단일화)에 맞춰
 * 컴포넌트 의존이 없는 중립 모듈로 이전(2026-06-26). 클라(session-context)·서버(session-info)·
 * UI(IdentitySwitcher)가 공유한다.
 */

export type SessionIdentity = {
  /** 묶음 내 profile.id (UUID). 본 계정도 자체 profile.id 그대로. */
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** profiles.role 값: 'admin' | 'doctor' | 'user' (호환성 alias) */
  kind: string;
};

export type SessionInfo = {
  role: "admin" | "doctor" | "user";
  displayName: string;
  avatarUrl: string | null;
  /** 헤더 아바타 1-click 진입용 */
  handle: string | null;
  doctorSlug: string | null;
  /** active profile 의 의사 매핑 doctor.id (UUID). SSOT: profiles.doctor_id.
   *  R4-2 (2026-07-04): CommentsBlock 등 클라 viewer 판정(me.doctor_id)의 세션 단일
   *  출처화용 — 서버 getSessionInfo 가 이미 조회하던 값이라 추가 쿼리 0. */
  doctorId: string | null;
  /** 본인이 보유한 모든 identity (본 계정 포함). 1개일 땐 dropdown 안 보임. */
  identities: SessionIdentity[];
  /** 현재 활성 identity id — 실제 profile.id (UUID). */
  activeIdentityId: string;
} | null;
