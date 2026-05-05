/**
 * Q&A 카테고리 정의.
 *
 * - condition  피부고민   (와인 #C62828)
 * - lifting    리프팅     (하늘색 #0288D1)
 * - injection  스킨부스터 (핑크 #EC407A)
 * - homecare   홈케어     (머스타드 #F57F17)
 * - other      피부상식   (진회 #424242) — 매핑 안 되는 키워드 자동 분류
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
  { slug: "lifting",   label: "리프팅",     color: "#0288D1" },
  { slug: "injection", label: "스킨부스터", color: "#EC407A" },
  { slug: "homecare",  label: "홈케어",     color: "#F57F17" },
  { slug: "other",     label: "피부상식",   color: "#424242" },
] as const;

/** 디폴트 활성 카테고리 (랜덤). 페이지 진입 시 1번 호출. */
export function pickDefaultCategory(): CategorySlug {
  // 정적 사이트와 동일하게 condition / lifting / injection 중 랜덤
  const candidates: CategorySlug[] = ["condition", "lifting", "injection"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
