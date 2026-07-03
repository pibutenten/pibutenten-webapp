/**
 * Fitzpatrick 피부톤 6단계 — UI 표시 SSOT (원장 확정 2026-07-03).
 *
 * 저장값은 `profiles.fitzpatrick` smallint 1~6(마이그 0323, CHECK 1~6 OR NULL) — 의학 표준
 * I(매우 밝음)~VI(짙음) 방향과 동일. 온보딩 "내 피부색과 가장 가까운 얼굴" 선택 UI 가 소비.
 * 톤 hex·캡션을 바꿀 때는 이 파일만 수정한다(화면 하드코딩 금지).
 */
export const FITZPATRICK_TONES = [
  { v: 1, tone: "#FDF0E6", caption: "북유럽·켈트계 매우 흰 피부" },
  { v: 2, tone: "#F4D8C3", caption: "밝은 한국인 피부" },
  { v: 3, tone: "#E6C3A1", caption: "보통 한국인 피부" },
  { v: 4, tone: "#BE9366", caption: "어두운 편 한국인 피부" },
  { v: 5, tone: "#8B5A33", caption: "인도·중동계 갈색 피부" },
  { v: 6, tone: "#422818", caption: "아프리카계 짙은 갈색 피부" },
] as const;
