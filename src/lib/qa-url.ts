/**
 * Q&A 글 URL 생성 헬퍼.
 *
 * v5.1 spec:
 *  - 의사 official 글 (doctor + post_year + post_slug):
 *      /doctors/{doctorSlug}/{year}/{post-slug} ← canonical (keyword slug, year 유지)
 *  - 회원 글 (author handle + shortcode):
 *      /{handle}/{shortcode} ← canonical (8자 base58, year 제거)
 *  - 의사 personal persona 글 (alt_handle + shortcode):
 *      /{alt_handle}/{shortcode} ← 회원 패턴과 동일
 *  - canonical 정보 부족 시 → 홈으로 (/qa, /feed 라우트 폐기됨)
 *  - 칼럼(article) → /article/{article_slug}
 */
export type QaUrlInput = {
  id: number;
  type?: "qa" | "post" | "article" | "link" | string;
  /** DB enum: 'official' | 'personal'. 옛 'doctor'/'self' 값도 backward-compat으로 매핑. */
  posted_as?: "official" | "personal" | "doctor" | "self" | string | null;
  article_slug?: string | null;
  doctor?: { slug: string } | null;
  post_year?: number | null;
  post_slug?: string | null;
  shortcode?: string | null;
  author?: {
    handle?: string | null;
    alt_handle?: string | null;
  } | null;
};

export function getQaUrl(qa: QaUrlInput): string {
  // 1) 칼럼은 article 라우트
  if (qa.type === "article" && qa.article_slug) {
    return `/article/${encodeURIComponent(qa.article_slug)}`;
  }

  const isOfficial =
    qa.posted_as === "official" || qa.posted_as === "doctor";
  const isPersonal =
    qa.posted_as === "personal" || qa.posted_as === "self";

  // 2) 의사 official 글 — keyword slug
  if (isOfficial && qa.doctor?.slug && qa.post_year && qa.post_slug) {
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${qa.post_slug}`;
  }

  // 3) 회원 글 또는 의사 personal — /{handle}/{shortcode} (year 세그먼트 제거)
  if (qa.shortcode) {
    const handle = isPersonal
      ? qa.author?.alt_handle ?? qa.author?.handle ?? null
      : qa.author?.handle ?? null;
    if (handle) {
      return `/${handle}/${qa.shortcode}`;
    }
  }

  // 4) fallback — 모든 글에 SEO URL이 있어야 함. 누락이면 홈으로.
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
  if (qa.type === "article") {
    // 칼럼은 별도 admin 편집 (현재 지원 X)
    return null;
  }
  if (!qa.shortcode) return null;
  return `/write/${qa.shortcode}`;
}
