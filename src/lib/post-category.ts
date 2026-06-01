/**
 * 본 파일은 **글 카테고리 (post category) — `cards.category` 컬럼 SSOT** 입니다.
 *
 * - 도메인 : 글 분류 자체 (qa/doodle 2종).
 * - 사용처 : 글 작성·필터·SEO 인덱싱 정책 전반.
 *
 * **혼동 주의** — Q&A 답변 페이지의 색상 칩 (피부고민/리프팅 등 5색) 과는 별개 개념입니다.
 * 답변 페이지 색상 칩은 `src/lib/categories.ts` (UI 메타) 참조.
 *
 * 글 카테고리(post category) — cards.category 컬럼과 1:1 매핑.
 *
 * v6 spec 2개 체계 (2026-06-01, 마이그 0198):
 *   - qa     Q&A         의사 답변 (의사·관리자 전용, 인덱싱)
 *   - doodle 끄적끄적     일반 포스팅 (회원·의사·관리자, noindex)
 *
 * (폐지) diary/ask/tip/link 는 전부 doodle 로 통합되었고 link 는 soft-delete 됨.
 *   review(시술후기) 는 추후 별도 추가 예정 (현재 범위 아님).
 */
export type PostCategorySlug =
  | "doodle"
  | "qa";

export type PostCategory = {
  slug: PostCategorySlug;
  label: string;
  /** 일반 회원 글쓰기에 노출 여부 (qa는 의사 전용) */
  publicForUsers: boolean;
  /**
   * 의사 직함 표시 default — true면 카드/스키마에서 "피부과 전문의" 직함이 숨겨짐.
   * 사적 글(끄적끄적) default true / 권위 글(Q&A) default false.
   * 사용자가 글 작성 시 토글 가능 (posts.hide_doctor_credential 컬럼).
   */
  defaultHideDoctorCredential: boolean;
};

// 노출 순서 (write UI 칩 순서 + 글쓰기 디폴트는 첫 번째):
//   끄적끄적 → (Q&A: 의사·관리자만)
import { ROLES } from "./identity-shared";

export const POST_CATEGORIES: readonly PostCategory[] = [
  { slug: "doodle", label: "끄적끄적", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "qa",     label: "Q&A",     publicForUsers: false, defaultHideDoctorCredential: false },
];

const SLUG_TO_LABEL: Record<PostCategorySlug, string> = Object.fromEntries(
  POST_CATEGORIES.map((c) => [c.slug, c.label]),
) as Record<PostCategorySlug, string>;

/** role별 글쓰기에서 선택 가능한 카테고리 목록 */
export function categoriesForRole(
  role: "user" | "doctor" | "admin",
): PostCategory[] {
  if (role === ROLES.USER) return POST_CATEGORIES.filter((c) => c.publicForUsers);
  return [...POST_CATEGORIES];
}

/** 외부 입력값 검증 (API 진입점에서 사용) */
export function isPostCategorySlug(
  s: string | null | undefined,
): s is PostCategorySlug {
  return s === "qa" || s === "doodle";
}

/** UI 라벨 lookup — invalid 입력은 빈 문자열 */
export function labelForCategory(s: string | null | undefined): string {
  return isPostCategorySlug(s) ? SLUG_TO_LABEL[s] : "";
}


/** 인덱싱 가능한 카테고리 (의사 글) — Q&A 만 */
export function isIndexableForDoctor(s: string | null | undefined): boolean {
  return s === "qa";
}

/** 인덱싱 가능한 카테고리 (회원 글) — 현재 없음 (doodle 은 noindex) */
export function isIndexableForMember(_s: string | null | undefined): boolean {
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 카테고리 라벨 SSOT (Sub-6, 2026-05-27) — 구 src/lib/category-labels.ts 통합
//
// POST_CATEGORIES 가 현재 활성 v6 2개의 단일 정의. 아래 derived 상수들은
// 라벨이 코드 곳곳에 하드코딩되던 누더기를 차단하기 위한 단일 출처.
// ─────────────────────────────────────────────────────────────────────────────

/** v6 현재 활성 2개 카테고리 라벨 (Set 형태) — 검색 입력 매칭용. POST_CATEGORIES 에서 derive. */
export const POST_CATEGORY_LABELS: ReadonlySet<string> = new Set(
  POST_CATEGORIES.map((c) => c.label),
);

/**
 * 사용자가 직접 입력한 카테고리 라벨 제거 헬퍼.
 * 현재 활성 라벨(Q&A·끄적끄적)을 keywords 에서 제거 — 카드 헤더 자동 라벨과 중복 방지.
 */
export function stripCategoryLabels(keywords: readonly string[]): string[] {
  return keywords.filter((k) => !POST_CATEGORY_LABELS.has(k));
}

/**
 * 검색 입력(label) → slug 매핑. 현재 2개는 POST_CATEGORIES 에서 derive.
 */
export const CATEGORY_LABEL_TO_SLUG: Readonly<Record<string, PostCategorySlug>> = {
  ...Object.fromEntries(
    POST_CATEGORIES.map((c) => [c.label, c.slug] as const),
  ),
} as Record<string, PostCategorySlug>;
