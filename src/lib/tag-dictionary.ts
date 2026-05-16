/**
 * 피부텐텐 태그 사전 + 정규화 룰 (호환 API).
 *
 * 통합 SSOT: `src/data/procedure-mappings/procedure-mappings.json` (v2.0+).
 * 본 모듈은 `@/lib/procedure-dict` 의 export 들을 그대로 노출하는 thin wrapper.
 *
 * 신규 정규화/블랙리스트/PubMed 키워드 추가:
 *   JSON 의 `normalizations` / `blacklist` / `mappings[].pubmedKeywords` 만 수정.
 *   코드 변경 불필요.
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
