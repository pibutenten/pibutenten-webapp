/**
 * Q&A 글 URL 생성 헬퍼.
 *
 * 정책 (§2 SEO 문서):
 *  - 의사 글 (doctor_id + post_year + post_slug 모두 있음):
 *      /doctors/{doctorSlug}/{year}/{postSlug} ← canonical
 *  - 그 외 (post_slug 부재 / 의사 없음 / 기타 fallback): /qa/{id}
 *  - 칼럼(article)은 별도: /article/{article_slug}
 */
export type QaUrlInput = {
  id: number;
  type?: "qa" | "post" | "article" | "link" | string;
  article_slug?: string | null;
  doctor?: { slug: string } | { slug: string } | null;
  post_year?: number | null;
  post_slug?: string | null;
};

export function getQaUrl(qa: QaUrlInput): string {
  // 칼럼은 article 라우트
  if (qa.type === "article" && qa.article_slug) {
    return `/article/${encodeURIComponent(qa.article_slug)}`;
  }
  // 의사 글 + slug + year 모두 있으면 canonical 새 URL
  const doctorSlug = qa.doctor?.slug;
  if (doctorSlug && qa.post_year && qa.post_slug) {
    return `/doctors/${doctorSlug}/${qa.post_year}/${qa.post_slug}`;
  }
  // fallback
  return `/qa/${qa.id}`;
}
