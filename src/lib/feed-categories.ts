/**
 * 홈 피드 카테고리 탭 SSOT — /?cat= 슬러그·칩 라벨 (2026-07-03, 검수 반영 신설).
 *
 * 서버(src/app/page.tsx — ?cat= 검증·카테고리 풀·메타 title)와
 * 클라(src/components/skin/FeedView.tsx — 칩 정의·URL→chip 싱크)가 함께 import 한다.
 * 종전엔 양쪽에 각자 정의돼 카테고리 추가 시 drift 위험이 있었다(검수관 지적).
 *
 * 글쓰기 카테고리 SSOT(post-category.ts::POST_CATEGORIES, 4종: qa/doodle/review/review_summary)의
 * "피드 노출 3종" UI 부분집합 — review_summary 는 피드 제외(리포트 탭 전용)라 여기 없음.
 * 카테고리를 추가·제거할 때는 POST_CATEGORIES·cards.category CHECK(루트 CLAUDE.md §5 페어)와
 * 함께 이 목록도 검토할 것.
 */
export const FEED_CATS = ["qa", "review", "doodle"] as const;
export type FeedCat = (typeof FEED_CATS)[number];

/** 칩·메타 title 라벨 — FeedView 칩과 /?cat= 메타가 공용. */
export const FEED_CAT_LABELS: Record<FeedCat, string> = {
  qa: "Q&A",
  review: "시술후기",
  doodle: "끄적끄적",
};

/** ?cat= 값 검증 — 화이트리스트 밖·미지정은 null(전체 풀). */
export function parseFeedCat(v: string | null | undefined): FeedCat | null {
  return (FEED_CATS as readonly string[]).includes(v ?? "") ? (v as FeedCat) : null;
}
