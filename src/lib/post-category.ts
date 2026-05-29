/**
 * 본 파일은 **글 카테고리 (post category) — `cards.category` 컬럼 SSOT** 입니다.
 *
 * - 도메인 : 글 분류 자체 (qa/tip/diary/ask/link/doodle 6종).
 * - 사용처 : 글 작성·필터·SEO 인덱싱 정책 전반.
 *
 * **혼동 주의** — Q&A 답변 페이지의 색상 칩 (피부고민/리프팅 등 5색) 과는 별개 개념입니다.
 * 답변 페이지 색상 칩은 `src/lib/categories.ts` (UI 메타) 참조.
 *
 * 글 카테고리(post category) — cards.category 컬럼과 1:1 매핑.
 *
 * v5.2 spec 6개 체계 (2026-05-15):
 *   - doodle 끄적끄적     짧은 생각/메모 (회원·의사 디폴트, noindex)
 *   - diary  피부일기     일상·피부 변화 (회원·의사, noindex)
 *   - tip    피부꿀팁     정보·노하우·후기 (회원·의사, 인덱싱)
 *   - ask    궁금해요     의견·고민 (회원·의사, noindex)
 *   - link   소식공유     외부 콘텐츠 큐레이션 + URL 카드 + 출처 표기 (회원·의사, noindex)
 *                         (slug 는 'link' 유지 — 푸터 액션 'share(공유)' 변수명 충돌 회피)
 *   - qa     Q&A         의사 답변 (의사·관리자 전용, 인덱싱)
 */
export type PostCategorySlug =
  | "doodle"
  | "diary"
  | "tip"
  | "ask"
  | "link"
  | "qa";

export type PostCategory = {
  slug: PostCategorySlug;
  label: string;
  /** 일반 회원 글쓰기에 노출 여부 (qa는 의사 전용) */
  publicForUsers: boolean;
  /**
   * 의사 직함 표시 default — true면 카드/스키마에서 "피부과 전문의" 직함이 숨겨짐.
   * 사적 글(피부일기·궁금해요·공유하기) default true / 권위 글(Q&A·꿀팁) default false.
   * 사용자가 글 작성 시 토글 가능 (posts.hide_doctor_credential 컬럼).
   */
  defaultHideDoctorCredential: boolean;
};

// 노출 순서 (write UI 칩 순서 + 글쓰기 디폴트는 첫 번째):
//   끄적끄적 → 피부일기 → 피부꿀팁 → 궁금해요 → 소식공유 → (Q&A: 의사·관리자만)
import { ROLES } from "./identity-shared";

export const POST_CATEGORIES: readonly PostCategory[] = [
  { slug: "doodle", label: "끄적끄적", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "diary",  label: "피부일기", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "tip",    label: "피부꿀팁", publicForUsers: true,  defaultHideDoctorCredential: false },
  { slug: "ask",    label: "궁금해요", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "link",   label: "소식공유", publicForUsers: true,  defaultHideDoctorCredential: true  },
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
  return (
    s === "qa" ||
    s === "tip" ||
    s === "diary" ||
    s === "ask" ||
    s === "link" ||
    s === "doodle"
  );
}

/** UI 라벨 lookup — invalid 입력은 빈 문자열 */
export function labelForCategory(s: string | null | undefined): string {
  return isPostCategorySlug(s) ? SLUG_TO_LABEL[s] : "";
}

// (defaultHideCredential 폐기됨 — POST_CATEGORIES 배열의 defaultHideDoctorCredential 필드 직접 참조로 충분)

/** 인덱싱 가능한 카테고리 (의사 글) */
export function isIndexableForDoctor(s: string | null | undefined): boolean {
  return s === "qa" || s === "tip";
}

/** 인덱싱 가능한 카테고리 (회원 글) — 꿀팁만 */
export function isIndexableForMember(s: string | null | undefined): boolean {
  return s === "tip";
}

// ─────────────────────────────────────────────────────────────────────────────
// 카테고리 라벨 SSOT (Sub-6, 2026-05-27) — 구 src/lib/category-labels.ts 통합
//
// POST_CATEGORIES 가 현재 활성 v5.2 6개의 단일 정의. 아래 derived 상수들은
// 라벨이 코드 곳곳에 하드코딩되던 누더기를 차단하기 위한 단일 출처. 옛 라벨은
// 데이터 마이그레이션 잔재(과거 row 의 keywords 컬럼 등) 호환용으로 LEGACY 에 분리.
// ─────────────────────────────────────────────────────────────────────────────

/** v5.2 현재 활성 6개 카테고리 라벨 (Set 형태) — 검색 입력 매칭용. POST_CATEGORIES 에서 derive. */
export const POST_CATEGORY_LABELS: ReadonlySet<string> = new Set(
  POST_CATEGORIES.map((c) => c.label),
);

/**
 * 사용자가 직접 입력한 카테고리 라벨 제거 헬퍼.
 * P2-3 (2026-05-29): 옛 v5.0/v5.1 LEGACY_CATEGORY_LABELS (꿀팁·공유하기·답해드려요·물어봐요·새소식)
 * 제거 — DB grep 결과 잔존 0건, 외부 호출 0건 확인.
 * CATEGORY_LABEL_TO_SLUG 의 옛 "공유하기" → "link" 매핑은 별도 검색 입력 호환용으로 유지.
 */
export function stripCategoryLabels(keywords: readonly string[]): string[] {
  return keywords.filter((k) => !POST_CATEGORY_LABELS.has(k));
}

/**
 * 검색 입력(label) → slug 매핑. 현재 6개는 POST_CATEGORIES 에서 derive,
 * 옛 라벨 "공유하기" 만 호환을 위해 "link" 로 명시 매핑 (search/page.tsx 호환).
 */
export const CATEGORY_LABEL_TO_SLUG: Readonly<Record<string, PostCategorySlug>> = {
  ...Object.fromEntries(
    POST_CATEGORIES.map((c) => [c.label, c.slug] as const),
  ),
  // 옛 라벨 → 현재 slug 호환 매핑 (사용자 입력 호환).
  "공유하기": "link",
} as Record<string, PostCategorySlug>;
