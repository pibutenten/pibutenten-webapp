/**
 * 글 카테고리(post category) — cards.category 컬럼과 1:1 매핑.
 *
 * v5.1+ spec 5개 체계:
 *   - qa     Q&A         의사 답변 (의사·관리자 전용, 인덱싱)
 *   - tip    피부꿀팁     정보·노하우·후기 (회원·의사, 인덱싱)
 *   - diary  피부일기     일상·피부 변화 (회원·의사, noindex)
 *   - ask    궁금해요     의견·고민 (회원·의사, noindex)
 *   - link   공유하기     외부 콘텐츠 큐레이션 + URL 카드 + 출처 표기 (회원·의사, noindex)
 *                         (slug는 'link'로 변경됨 — 푸터 액션 'share(공유)'와 변수명 충돌 회피)
 */
export type PostCategorySlug = "qa" | "tip" | "diary" | "ask" | "link";

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

export const POST_CATEGORIES: readonly PostCategory[] = [
  { slug: "tip",   label: "피부꿀팁", publicForUsers: true,  defaultHideDoctorCredential: false },
  { slug: "diary", label: "피부일기", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "ask",   label: "궁금해요", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "link",  label: "공유하기", publicForUsers: true,  defaultHideDoctorCredential: true  },
  { slug: "qa",    label: "Q&A",     publicForUsers: false, defaultHideDoctorCredential: false },
];

const SLUG_TO_LABEL: Record<PostCategorySlug, string> = Object.fromEntries(
  POST_CATEGORIES.map((c) => [c.slug, c.label]),
) as Record<PostCategorySlug, string>;

const SLUG_TO_HIDE_DEFAULT: Record<PostCategorySlug, boolean> =
  Object.fromEntries(
    POST_CATEGORIES.map((c) => [c.slug, c.defaultHideDoctorCredential]),
  ) as Record<PostCategorySlug, boolean>;

/** role별 글쓰기에서 선택 가능한 카테고리 목록 */
export function categoriesForRole(
  role: "user" | "doctor" | "admin",
): PostCategory[] {
  if (role === "user") return POST_CATEGORIES.filter((c) => c.publicForUsers);
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
    s === "link"
  );
}

/** UI 라벨 lookup — invalid 입력은 빈 문자열 */
export function labelForCategory(s: string | null | undefined): string {
  return isPostCategorySlug(s) ? SLUG_TO_LABEL[s] : "";
}

/** 카테고리 default — 의사 직함 숨김 여부 */
export function defaultHideCredential(
  s: string | null | undefined,
): boolean {
  return isPostCategorySlug(s) ? SLUG_TO_HIDE_DEFAULT[s] : false;
}

/** 인덱싱 가능한 카테고리 (의사 글) */
export function isIndexableForDoctor(s: string | null | undefined): boolean {
  return s === "qa" || s === "tip";
}

/** 인덱싱 가능한 카테고리 (회원 글) — 꿀팁만 */
export function isIndexableForMember(s: string | null | undefined): boolean {
  return s === "tip";
}
