/**
 * Q&A 카테고리 정의.
 * 정적 사이트(pbtt-search)의 CATEGORY_SETS 색상·슬러그 그대로 계승.
 *
 * - condition  피부고민   (와인)
 * - lifting    리프팅     (파랑)
 * - injection  스킨부스터 (보라)
 * - homecare   홈케어     (머스타드)
 * - other      피부상식   (진회) — 매핑 안 되는 키워드 자동 분류
 */
export type CategorySlug =
  | "condition"
  | "lifting"
  | "injection"
  | "homecare"
  | "other";

export type Category = {
  slug: CategorySlug;
  label: string;
  color: string;
};

export const CATEGORIES: readonly Category[] = [
  { slug: "condition", label: "피부고민",   color: "#C62828" },
  { slug: "lifting",   label: "리프팅",     color: "#1565C0" },
  { slug: "injection", label: "스킨부스터", color: "#6A1B9A" },
  { slug: "homecare",  label: "홈케어",     color: "#F57F17" },
  { slug: "other",     label: "피부상식",   color: "#424242" },
] as const;

/** 디폴트 활성 카테고리 (랜덤). 페이지 진입 시 1번 호출. */
export function pickDefaultCategory(): CategorySlug {
  // 정적 사이트와 동일하게 condition / lifting / injection 중 랜덤
  const candidates: CategorySlug[] = ["condition", "lifting", "injection"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
