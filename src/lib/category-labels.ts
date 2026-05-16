/**
 * 카테고리 라벨 모음 — Card / 검색 / 글쓰기 폼 공통 SSOT.
 *
 * - POST_CATEGORY_LABELS: 현재 활성 v5.2 6개 라벨 (Set). 검색 입력이 카테고리 라벨이면
 *   콘텐츠 카테고리 추정 X (search/page.tsx 가 직접 분기) — 색칠 분기에서 사용.
 * - ALL_CATEGORY_LABELS: 옛 라벨 + 현재 라벨 모두 (배열). keywords 에서 사용자 직접 입력된
 *   카테고리 라벨 제거(중복 표시 방지)용. articles route 의 CATEGORY_LABELS_TO_STRIP 와 의미 동일.
 */

/** v5.2 현재 활성 6개 카테고리 라벨 (Set 형태) — 검색 입력 매칭용. */
export const POST_CATEGORY_LABELS: ReadonlySet<string> = new Set([
  "끄적끄적",
  "피부일기",
  "피부꿀팁",
  "궁금해요",
  "소식공유",
  "Q&A",
]);

/**
 * 옛/현재 라벨 모음 (배열) — 데이터 마이그레이션 잔재 가능성 대비 보수적 strip.
 *  - v5.2 (현재): 끄적끄적·피부일기·피부꿀팁·궁금해요·소식공유·Q&A
 *  - v5.1 옛   : 꿀팁·공유하기
 *  - v5.0 이전 : 답해드려요·물어봐요·새소식
 */
export const ALL_CATEGORY_LABELS: readonly string[] = [
  // v5.2 현재
  "끄적끄적",
  "피부일기",
  "피부꿀팁",
  "궁금해요",
  "소식공유",
  "Q&A",
  // v5.1 옛
  "꿀팁",
  "공유하기",
  // v5.0 이전
  "답해드려요",
  "물어봐요",
  "새소식",
];

/** 사용자가 직접 입력한 카테고리 라벨(옛/현재) 제거 헬퍼. */
export function stripCategoryLabels(keywords: readonly string[]): string[] {
  return keywords.filter((k) => !ALL_CATEGORY_LABELS.includes(k));
}
