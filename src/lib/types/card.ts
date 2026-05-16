/**
 * CardData — `cards` 테이블 row + 조인된 author/doctor/video 통합 타입.
 *
 * 이 타입은 Card 컴포넌트, Feed, ProfileTabs, RSC 페이지, lib/feed-shuffle 등
 * 15곳 이상에서 import한다. 변경 시 의존 그래프 전체에 영향.
 */

export type PubmedRef = {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
  reasoning?: string | null;
};

export type CardData = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  share_count?: number;
  comment_count?: number;
  /** v4 — 저장(북마크) 누적 수 (cards.save_count) */
  save_count?: number;
  type?: "card" | "post" | "link";
  created_at?: string;
  /** §2 SEO URL — /doctors/{slug}/{year}/{postSlug} canonical 생성용 */
  post_year?: number | null;
  post_slug?: string | null;
  /** v4 — 회원 글 URL용 8자 base58 식별자 */
  shortcode?: string | null;
  /** 외부 링크 — 모든 카테고리에서 옵션 (Phase 3). card 카테고리 외에서는 카드에 [더 알아보기] 버튼 노출 */
  external_url?: string | null;
  external_title?: string | null;
  external_description?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  /** 글 분류 카테고리 (Phase 2) */
  category?: string | null;
  /** 의사 직함 숨김 (Phase A.2) — true면 사적 모드, "피부과 전문의" 배지 숨김 */
  hide_doctor_credential?: boolean | null;
  /** Phase 6 — 카드 하단 ref. 박스용 PubMed 단일 참고문헌. (legacy, 호환성 유지) */
  pubmed_ref?: PubmedRef | null;
  /** Phase 9 (0054) — 멀티 참고문헌 배열. 있으면 우선, 없으면 pubmed_ref 사용 */
  pubmed_refs?: PubmedRef[] | null;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    /** v4 — 회원 핸들 (URL용) */
    handle?: string | null;
    /** v4 — avatar cache buster용. profile.updated_at (avatar 변경 시 갱신) */
    updated_at?: string | null;
  } | null;
  video: {
    youtube_id: string;
    youtube_url: string;
    topic: string | null;
    upload_date: string | null;
  } | null;
};
