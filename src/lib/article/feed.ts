import type { ArticleRow, ArticleSection, ArticleSectionVirtualCard } from "./types";

/**
 * Article row 1개를 섹션별 가상 카드 N개로 분할.
 * 피드에 article 본체가 아닌 각 섹션이 카드로 노출되도록 한다.
 */
export function splitArticleToVirtualCards(
  article: ArticleRow,
): ArticleSectionVirtualCard[] {
  const sections = (article.article_sections ?? []) as ArticleSection[];
  return sections
    .filter((s) => s && (s.heading?.trim() || s.body?.trim()))
    .map((s, i) => ({
      articleId: article.id,
      sectionIndex: i,
      heading: s.heading ?? "",
      body: s.body ?? "",
      articleSlug: article.article_slug,
      keywords: article.keywords ?? [],
      like_count: article.like_count ?? 0,
      view_count: article.view_count ?? 0,
      doctor: article.doctor,
      created_at: article.created_at,
    }));
}
