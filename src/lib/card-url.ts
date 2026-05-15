/**
 * Q&A 글 URL 생성 헬퍼.
 *
 * v5.1 spec (칼럼 폐기 후):
 *  - 의사 글 (doctor + post_year + post_slug):
 *      /doctors/{doctorSlug}/{year}/{post-slug} ← canonical (keyword slug, year 유지)
 *  - 회원 글 (author handle + shortcode):
 *      /{handle}/{shortcode} ← canonical (8자 base58, year 제거)
 *  - canonical 정보 부족 시 → 홈으로 (/qa, /feed, /article 라우트 폐기됨)
 */
export type QaUrlInput = {
  id: number;
  /** 'qa' / 'post' / 'link' */
  type?: "qa" | "post" | "link" | string;
  doctor?: { slug: string } | null;
  post_year?: number | null;
  post_slug?: string | null;
  shortcode?: string | null;
  author?: {
    handle?: string | null;
  } | null;
};

export function getQaUrl(qa: QaUrlInput): string {
  // 1) 의사 글 — keyword slug
  if (qa.doctor?.slug && qa.post_year && qa.post_slug) {
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${qa.post_slug}`;
  }

  // 2) 회원 글 — /{handle}/{shortcode}
  if (qa.shortcode && qa.author?.handle) {
    return `/${qa.author.handle}/${qa.shortcode}`;
  }

  // 3) fallback — 모든 글에 SEO URL이 있어야 함. 누락이면 홈으로.
  return "/";
}

/**
 * 글 수정 페이지 URL.
 *
 * v5.1 spec: /write 라우트로 통합.
 *  - 신규 작성: /write
 *  - 기존 글 수정: /write/{shortcode}
 *
 * 권한 체크는 page.tsx에서 shortcode 기반으로만 진행 (handle 검증 불필요).
 * 정보 부족 시 null 반환 — 호출 측에서 메뉴 노출/숨김 처리.
 */
export function getQaEditUrl(qa: QaUrlInput): string | null {
  if (!qa.shortcode) return null;
  return `/write/${qa.shortcode}`;
}
