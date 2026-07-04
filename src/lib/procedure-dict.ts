/**
 * 피부텐텐 시술명/태그 통합 사전 — 단일 SSOT.
 *
 * 소스: DB `tag_dictionary`(+tag_blacklist·tag_normalization) → 빌드타임 스냅샷
 *   `src/data/tag-dictionary.generated.json` (gen-tag-dictionary.mjs). 모든 lookup 이 스냅샷 기준(DB 단독).
 *
 * 이 모듈이 제공하는 단일 진입점을 통해 lookup 하세요 (서버 코드 기준).
 *
 *  - categoryFor(keyword)         — 키워드 → 9분류 카테고리(lifting/skinbooster/filler/contour/laser/other/concerns/homecare/knowledge)
 *  - slugFor(keyword)             — 한글 키워드 → URL slug (영문)
 *  - pubmedKeywordsFor(keyword)   — 키워드 → PubMed 영문 검색어 배열 (없으면 null)
 *  - normalizeTag(rawTag)         — 합성어/표기 → 정규화된 태그 배열 (블랙리스트면 빈 배열)
 *  - normalizeTags(tags)          — 배열 정규화 + 중복 제거
 *  - isBlacklisted(tag)           — 블랙리스트 포함 여부
 *
 * 다른 모듈(category-sets, tag-dictionary)은 이 파일을 thin wrapper 로 사용.
 *
 * R4-3 클라이언트 번들 분리: categoryFor·normalizeTag(s)·isBlacklisted 구현은
 *   `./procedure-dict.client`(경량 스냅샷 tag-dictionary.client.generated.json 소비)에 있고
 *   여기서 re-export 한다 — 서버 호출부는 import 경로·시그니처·동작 모두 종전과 동일.
 *   **클라이언트 컴포넌트는 이 파일이 아니라 `./procedure-dict.client` 를 import 할 것**
 *   (이 파일은 전체 스냅샷 ~200KB 를 로드하므로 클라에서 import 하면 번들에 실림).
 *
 * 신규 시술명 추가: tag_dictionary(DB)에 행 추가 → prebuild 스냅샷 재생성으로 자동 반영.
 */

import snapshot from "@/data/tag-dictionary.generated.json";

export { categoryFor, normalizeTag, normalizeTags, isBlacklisted } from "./procedure-dict.client";

// ── 빌드타임 전체 스냅샷 (SSOT=DB tag_dictionary) — 서버 전용 필드 ──
//   slugFor/pubmedKeywordsFor/getPubmedDict 가 이 스냅샷을 읽는다 (동기·시그니처 불변).
//   category/blacklist/normalizations lookup 은 클라 투영(동일 데이터)을 읽는 client 모듈로 이동.
//   생성: scripts/gen-tag-dictionary.mjs (package.json prebuild). DB 미접근 시 커밋된 스냅샷 보존.
const SNAP = snapshot as unknown as {
  slug: Record<string, string>;
  pubmed: Record<string, string[]>; // ko(canonical) → PubMed (getPubmedDict)
  pubmedLookup: Record<string, string[]>; // ko/synonym/alias → PubMed (pubmedKeywordsFor)
};
const SNAP_SLUG = SNAP.slug;

// ── public API (서버 전용) ───────────────────────────────────

/** 한글 키워드 → 영문 slug. 사전에 없으면 null. (DB 스냅샷 기준) */
export function slugFor(keyword: string): string | null {
  return SNAP_SLUG[keyword] ?? null;
}

/** 키워드 → PubMed 영문 검색어 배열. 사전에 없거나 항목 없으면 null. (DB 스냅샷 기준) */
export function pubmedKeywordsFor(keyword: string): string[] | null {
  return SNAP.pubmedLookup[keyword] ?? null;
}

/** PubMed dict 전체 (canonical ko → 검색어) — step1_v5 프롬프트 빌드 시 사용. (DB 스냅샷 기준) */
export function getPubmedDict(): Record<string, string[]> {
  return { ...SNAP.pubmed };
}
