/**
 * cards 테이블 SELECT 컬럼 리스트 통합.
 *
 * 5곳에서 각자 미세하게 다른 column list 를 작성하던 것을 통합:
 *   - src/app/page.tsx (홈 피드 — 본인 최신글 prepend 쿼리)
 *   - src/app/search/page.tsx (카테고리 직접 필터)
 *   - src/app/[handle]/page.tsx (회원 프로필)
 *   - src/app/[handle]/[shortcode]/page.tsx (회원 글 단독)
 *   - src/app/doctors/[slug]/[year]/[postSlug]/page.tsx (의사 글 단독)
 *
 * 발견된 차이 (보고서 §4):
 *   - pubmed_refs: doctors[year][postSlug] 만 포함 → DETAIL select 에만 포함 (멀티 ref은 단독 페이지에서만 사용)
 *   - (ADR 0012 정합 2026-05-26: 옛 pubmed_ref 단일 컬럼은 마이그레이션 0166 으로 DROP)
 *   - share_count/save_count: 일부만 → LIST select 에 포함 (CardData 에 optional)
 *   - video: 일부만 → 모든 select 에 포함 (CardData 에 nullable)
 *   - doctor 의 extras (id, title, clinic, profile_data, primary_color, accent_color):
 *     CardData 타입에 없고 코드에서 미사용 → 드롭 (over-fetch 제거)
 *   - author 의 role/updated_at: CardData 에 optional, updated_at 은 avatar cachebust 용도 → 유지
 *   - author FK 표기: profiles!author_id 와 profiles!cards_author_id_profiles_fkey 혼용 →
 *     explicit FK 명 (cards_author_id_profiles_fkey) 로 통일
 */

/**
 * 카드 목록(피드/리스트) 용 SELECT.
 * 검색 결과, 회원 프로필, 홈 피드 부속 쿼리 등에서 사용.
 *
 * `created_at` 은 포함하되 `updated_at` 은 단독 페이지(DETAIL)에서만 필요.
 */
export const CARD_LIST_SELECT = `
  id, question, answer, meta, keywords, type, status, created_at,
  like_count, view_count, save_count, share_count,
  post_year, post_slug, shortcode,
  category, hide_doctor_credential,
  external_url, external_title, external_description, external_image, external_site_name,
  doctor:doctors(slug, name, branch),
  author:profiles!cards_author_id_profiles_fkey(id, display_name, avatar_url, handle, updated_at),
  video:videos(youtube_id, youtube_url, topic, upload_date)
`;

/**
 * 카드 단독 페이지(/[handle]/[shortcode], /doctors/[slug]/[year]/[postSlug]) 용 SELECT.
 *
 * LIST select 에 더하여:
 *   - `updated_at`: 마지막 수정 시각 표시
 *   - `pubmed_refs`: 멀티 참고문헌 배열 (Phase 9, 단독 페이지에서만 표시)
 */
export const CARD_DETAIL_SELECT = `
  id, question, answer, meta, keywords, type, status, created_at, updated_at,
  like_count, view_count, save_count, share_count,
  post_year, post_slug, shortcode,
  category, hide_doctor_credential, pubmed_refs,
  external_url, external_title, external_description, external_image, external_site_name,
  doctor:doctors(slug, name, branch),
  author:profiles!cards_author_id_profiles_fkey(id, display_name, avatar_url, handle, updated_at),
  video:videos(youtube_id, youtube_url, topic, upload_date)
`;
