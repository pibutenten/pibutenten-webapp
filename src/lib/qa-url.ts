/**
 * Q&A 글 URL 생성 헬퍼.
 *
 * v4 spec:
 *  - 의사 official 글 (doctor + post_year + post_slug):
 *      /doctors/{doctorSlug}/{year}/{post-slug} ← canonical (keyword slug)
 *  - 회원 글 (author handle + post_year + shortcode):
 *      /{handle}/{year}/{shortcode} ← canonical (8자 base58)
 *  - 의사 personal persona 글 (alt_handle + post_year + shortcode):
 *      /{alt_handle}/{year}/{shortcode} ← 회원 패턴과 동일
 *  - canonical 정보 부족 (handle/slug 부재) → /qa/{id} fallback
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

  // 4) fallback
  return `/qa/${qa.id}`;
}
