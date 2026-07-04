/**
 * 피부텐텐 태그 사전 + 정규화 룰 (호환 API).
 *
 * 통합 SSOT: DB `tag_dictionary`(+tag_normalization·tag_blacklist) → 빌드타임 스냅샷.
 * 본 모듈은 `@/lib/procedure-dict` 의 export 들을 그대로 노출하는 thin wrapper.
 *
 * ⚠️ 서버 전용 (R4-3): PUBMED_KEYWORD_DICT 가 전체 스냅샷(~200KB)을 로드하므로
 *   클라이언트 컴포넌트는 이 파일 대신 `@/lib/procedure-dict.client` 의
 *   normalizeTag(s) 를 import 할 것 (동일 구현·동일 데이터).
 *
 * 신규 정규화/블랙리스트/PubMed 키워드 추가:
 *   DB `tag_normalization` / `tag_blacklist` / `tag_dictionary.pubmed_keywords` 수정 →
 *   prebuild 스냅샷 재생성으로 자동 반영. 코드 변경 불필요.
 */
import {
  normalizeTag as _normalizeTag,
  normalizeTags as _normalizeTags,
  getPubmedDict,
} from "./procedure-dict";

/** 단일 raw 태그 → 정규화 결과 배열 (빈 배열 = 제거). */
export function normalizeTag(raw: string): string[] {
  return _normalizeTag(raw);
}

/** 태그 배열 정규화 + 중복 제거 + 순서 보존. */
export function normalizeTags(tags: readonly string[]): string[] {
  return _normalizeTags(tags);
}

/**
 * 한국어 → 영문 PubMed 검색 키워드 사전 (호환 export).
 * 새 코드는 `procedure-dict.pubmedKeywordsFor(keyword)` 직접 사용 권장.
 */
export const PUBMED_KEYWORD_DICT: Record<string, string[]> = getPubmedDict();
