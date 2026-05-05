/**
 * Article 타입 정의 (원장 칼럼)
 */

export type ArticleSection = {
  /** 섹션 소제목 */
  heading: string;
  /** 본문 (줄바꿈 포함) */
  body: string;
  /** 섹션 이미지 URL (Supabase Storage public URL). 없으면 null */
  image: string | null;
};

export type ArticleRow = {
  id: number;
  question: string; // article에서는 제목으로 사용
  article_sections: ArticleSection[];
  article_cover_image: string | null;
  article_slug: string;
  keywords: string[];
  like_count: number;
  view_count: number;
  created_at: string;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
};

/** 피드용 article-section 가상 카드 (DB row 아님) */
export type ArticleSectionVirtualCard = {
  /** 부모 article id (실제 qas.id) */
  articleId: number;
  /** 섹션 인덱스 (0-base) */
  sectionIndex: number;
  /** 섹션 heading */
  heading: string;
  /** 섹션 body */
  body: string;
  /** article slug — 전체 보기 링크 */
  articleSlug: string;
  /** keywords (article 전체 키워드 동일하게 사용) */
  keywords: string[];
  /** like / view (article 전체 카운트 사용) */
  like_count: number;
  view_count: number;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  created_at: string;
};
