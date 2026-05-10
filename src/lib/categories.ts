/**
 * Q&A 카테고리 정의.
 * 5색 색상 분산 (보라·하늘·핑크·테라코타·올리브).
 *
 * - concerns     피부고민   (딥 라벤더 #7E57C2)
 * - lifting      리프팅     (파스텔 하늘 #29B6F6)
 * - injectables  스킨부스터 (연핑크 #F48FB1)
 * - homecare     홈케어     (테라코타 #BF6E5C)
 * - knowledge    피부상식   (올리브 #9E9D24) — 매핑 안 되는 태그 자동 분류
 */
export type CategorySlug =
  | "concerns"
  | "lifting"
  | "injectables"
  | "homecare"
  | "knowledge";

export type Category = {
  slug: CategorySlug;
  label: string;
  color: string;
};

export const CATEGORIES: readonly Category[] = [
  { slug: "concerns",    label: "피부고민",   color: "#7E57C2" },
  { slug: "lifting",     label: "리프팅",     color: "#29B6F6" },
  { slug: "injectables", label: "스킨부스터", color: "#F48FB1" },
  { slug: "homecare",    label: "홈케어",     color: "#BF6E5C" },
  { slug: "knowledge",   label: "피부상식",   color: "#9E9D24" },
] as const;

/** 디폴트 활성 카테고리 (랜덤). 페이지 진입 시 1번 호출. */
export function pickDefaultCategory(): CategorySlug {
  // 정적 사이트와 동일하게 concerns / lifting / injectables 중 랜덤
  const candidates: CategorySlug[] = ["concerns", "lifting", "injectables"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
