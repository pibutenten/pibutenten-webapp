/**
 * 본 파일은 **Q&A 답변 페이지의 9색 카테고리 칩** 전용 메타 정의입니다.
 *
 * - 도메인 : 의사 답변 상단의 9개 카테고리 색상 칩 (UI 한정).
 * - 사용처 : 의사 답변 페이지의 키워드 분류 위젯.
 *
 * **혼동 주의** — `cards.category` 컬럼 (글 분류) 과 무관한 다른 개념입니다.
 * 글 카테고리 분류 (qa/doodle/review/review_summary) 는 `src/lib/post-category.ts` 참조.
 *
 * 9색 색상 분산:
 *
 * - concerns     피부고민     (딥 라벤더 #7E57C2)
 * - lifting      리프팅       (블루 #1E88E5)
 * - skinbooster  스킨부스터   (연핑크 #F48FB1)
 * - filler       필러·볼륨    (오렌지 #FFA726)
 * - contour      주름·윤곽    (틸 #26A69A)
 * - laser        레이저       (코럴 #E57373)
 * - other        기타         (블루그레이 #78909C)
 * - homecare     홈케어       (테라코타 #BF6E5C)
 * - knowledge    피부상식     (올리브 #9E9D24) — 매핑 안 되는 태그 자동 분류
 */
export type CategorySlug =
  | "concerns"
  | "lifting"
  | "skinbooster"
  | "filler"
  | "contour"
  | "laser"
  | "other"
  | "homecare"
  | "knowledge";

export type Category = {
  slug: CategorySlug;
  label: string;
  color: string;
};

export const CATEGORIES: readonly Category[] = [
  { slug: "concerns",    label: "피부고민",   color: "#7E57C2" },
  { slug: "lifting",     label: "리프팅",     color: "#1E88E5" },
  { slug: "skinbooster", label: "스킨부스터", color: "#F48FB1" },
  { slug: "filler",      label: "필러·볼륨",  color: "#FFA726" },
  { slug: "contour",     label: "주름·윤곽",  color: "#26A69A" },
  { slug: "laser",       label: "레이저",     color: "#E57373" },
  { slug: "other",       label: "기타",       color: "#78909C" },
  { slug: "homecare",    label: "홈케어",     color: "#BF6E5C" },
  { slug: "knowledge",   label: "피부상식",   color: "#9E9D24" },
] as const;

/** 시술 카테고리 슬러그 (concerns·homecare·knowledge 제외) */
export const PROCEDURE_SLUGS = ["lifting","skinbooster","filler","contour","laser","other"] as const;
export type ProcedureSlug = (typeof PROCEDURE_SLUGS)[number];

/** 시술 카테고리 객체 배열 (CATEGORIES 에서 파생) */
export const PROCEDURE_CATEGORIES = CATEGORIES.filter(
  (c): c is Category & { slug: ProcedureSlug } =>
    (PROCEDURE_SLUGS as readonly string[]).includes(c.slug),
);

/** 디폴트 활성 카테고리 (랜덤). 페이지 진입 시 1번 호출. */
export function pickDefaultCategory(): ProcedureSlug {
  // "other" 제외 5종 중 랜덤
  const candidates: ProcedureSlug[] = ["lifting", "skinbooster", "filler", "contour", "laser"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
