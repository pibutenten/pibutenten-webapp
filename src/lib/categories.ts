/**
 * Q&A 카테고리 정의.
 * 5색 모두 부드러운 파스텔 톤 + 색상 분산 (보라·하늘·핑크·민트·그레이).
 *
 * - condition  피부고민   (딥 라벤더 #7E57C2)
 * - lifting    리프팅     (파스텔 하늘 #29B6F6)
 * - injection  스킨부스터 (파스텔 핑크 #F06292)
 * - homecare   홈케어     (민트/티얼 #4DB6AC)
 * - other      피부상식   (블루그레이 #78909C) — 매핑 안 되는 키워드 자동 분류
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
  { slug: "condition", label: "피부고민",   color: "#7E57C2" },
  { slug: "lifting",   label: "리프팅",     color: "#29B6F6" },
  { slug: "injection", label: "스킨부스터", color: "#F06292" },
  { slug: "homecare",  label: "홈케어",     color: "#4DB6AC" },
  { slug: "other",     label: "피부상식",   color: "#78909C" },
] as const;

/** 디폴트 활성 카테고리 (랜덤). 페이지 진입 시 1번 호출. */
export function pickDefaultCategory(): CategorySlug {
  // 정적 사이트와 동일하게 condition / lifting / injection 중 랜덤
  const candidates: CategorySlug[] = ["condition", "lifting", "injection"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
