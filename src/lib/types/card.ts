/**
 * CardData — `cards` 테이블 row + 조인된 author/doctor/video 통합 타입.
 *
 * 이 타입은 Card 컴포넌트, Feed, ProfileTabs, RSC 페이지, lib/feed-shuffle 등
 * 15곳 이상에서 import한다. 변경 시 의존 그래프 전체에 영향.
 */

import type { PubmedRefObj } from "@/lib/schema/api/articles";

/**
 * Critical-4 (2026-05-27): 옛 PubmedRef 로컬 재정의 제거.
 * SSOT 는 src/lib/schema/api/articles.ts 의 PubmedRefSchema 한 곳.
 * 본 CardData 는 그 타입(PubmedRefObj) 그대로 재노출.
 */
export type PubmedRef = PubmedRefObj;

/**
 * ReviewSummaryData — 시술후기 카드(type=review)의 정량 요약.
 *
 * `procedure_reviews` 테이블(card_id unique FK→cards)에서 임베드.
 *   - satisfaction/pain: 1~5
 *   - revisit: 'yes' | 'maybe' | 'no' (구버전 호환 위해 string 폭넓게 허용)
 *   - effect_areas: 체감 효과 라벨 배열 (NULL 가능)
 *   - procedure_ko: 시술명 (한글)
 */
export type ReviewSummaryData = {
  satisfaction: number;
  pain: number;
  revisit: "yes" | "maybe" | "no" | string;
  effect_areas: string[] | null;
  procedure_ko: string;
};

export type CardData = {
  id: number;
  /** P2-4 (2026-05-27): 옛 `question` 컬럼 → 범용 `title` 로 리네임. */
  title: string;
  /** P2-4 (2026-05-27): 옛 `answer` 컬럼 → 범용 `body` 로 리네임. */
  body: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  share_count?: number;
  comment_count?: number;
  /** v4 — 저장(북마크) 누적 수 (cards.save_count) */
  save_count?: number;
  /** DB enum `qa_card_type` 와 1:1 정합. 옛 "card"/"link" 리터럴 폐기 (P2-6, 2026-05-29).
   *  "review" = 시술후기 카드(`/api/reviews` 전용 폼 생성, procedure_reviews 1:1).
   *  "review_summary" = 시술 리포트 앵커(C1~). */
  type?: "qa" | "post" | "review" | "review_summary";
  created_at?: string;
  /** 의료 검토일 SSOT (P1-b). Q&A=검수일, post=NULL. 표시일 = reviewed_at ?? created_at. */
  reviewed_at?: string | null;
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
  /** 카드 상태 (qa_status: draft/pending_review/published/archived/hidden).
   *  Phase 8-extra (2026-05-22): admin ⋮ 메뉴의 숨김 토글 활성 조건 판정용.
   *  일반 회원/원장 뷰에서는 RLS가 published 만 노출하므로 사실상 published.
   *  optional — 모든 select 가 status 를 가져오진 않음. undefined 면 메뉴 미노출. */
  status?: string | null;
  /** 의사 직함 숨김 (Phase A.2) — true면 사적 모드, "피부과 전문의" 배지 숨김 */
  hide_doctor_credential?: boolean | null;
  /** PubMed 참고문헌 배열. ADR 0012 (2026-05-26) — 옛 단일 pubmed_ref 컬럼 폐기, 배열 단일 출처. */
  pubmed_refs?: PubmedRef[] | null;
  doctor: {
    id: string;
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
  /** 시술후기 정량 요약 (type=review 카드만). PostgREST 임베드 — card_id 가
   *  unique FK 라 보통 객체 1개로 오나, 배열로 올 수도 있어 둘 다 방어 (렌더에서 정규화). */
  procedure_review?: ReviewSummaryData | ReviewSummaryData[] | null;
};

/**
 * CardDataList — 피드/검색/태그/프로필 리스트 컨텍스트에서 사용하는 alias (2026-05-28).
 *
 * 의미: "리스트 SELECT (CARD_LIST_SELECT) 가 반환하는 컬럼 집합".
 *   - status, updated_at 등 detail 전용 필드는 optional 그대로 (없는 경우가 정상).
 *   - 현 시점에는 CardData 와 동일 구조. 이후 List 전용 컬럼 (예: 짧은 본문 preview)
 *     을 추가할 때 본 alias 만 확장.
 *
 * 사용처: Feed.tsx, CardMasonry.tsx, ProfileTabs.tsx, page.tsx(홈/검색/topics) 등.
 */
export type CardDataList = CardData;

/**
 * CardDataDetail — 단일 글 페이지 컨텍스트에서 사용하는 강화 alias (2026-05-28).
 *
 * 의미: "디테일 SELECT (CARD_DETAIL_SELECT) 가 반환하는 컬럼 집합 + 강화된 필드".
 *   - updated_at, status 가 항상 존재 (CARD_DETAIL_SELECT 가 가져옴).
 *   - 의사 페이지의 JSON-LD lastReviewed 등 detail 전용 표시에 필요.
 *
 * 사용처: app/doctors/[slug]/[year]/[postSlug]/page.tsx,
 *         app/[handle]/[shortcode]/page.tsx 등 단일 글 RSC.
 */
export type CardDataDetail = CardData & {
  updated_at: string;
  status: string;
};
