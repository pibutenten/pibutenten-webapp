/**
 * 사용자 등급(role) + 활동 등급(level) 라벨 + 색상.
 * 카드 / 회원관리 / 프로필에서 공통으로 사용.
 */

export type UserRole = "admin" | "doctor" | "user";
export type UserLevel = 0 | 1 | 2 | 3;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  doctor: "원장",
  user: "회원",
};

export const LEVEL_LABELS: Record<UserLevel, string> = {
  0: "일반",
  1: "🌟 활동회원",
  2: "💎 단골",
  3: "👑 VIP",
};

export const LEVEL_COLORS: Record<UserLevel, { bg: string; fg: string }> = {
  0: { bg: "#F5F5F5", fg: "#9E9E9E" },
  1: { bg: "#E8F5E9", fg: "#2E7D32" },
  2: { bg: "#F3E5F5", fg: "#6A1B9A" },
  3: { bg: "#FFF3E0", fg: "#C77800" },
};

/** 카드/프로필에 표시할 짧은 라벨 — 일반 사용자(level 0)는 안 보여줌 */
export function levelBadgeText(level: UserLevel | null | undefined): string | null {
  if (level == null || level === 0) return null;
  return LEVEL_LABELS[level];
}
