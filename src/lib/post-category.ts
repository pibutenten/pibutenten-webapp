/**
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
