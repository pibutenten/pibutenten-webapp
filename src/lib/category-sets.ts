/**
 * 태그 → 카테고리 매핑 (호환 API).
 *
 * 통합 SSOT: `src/data/procedure-mappings/procedure-mappings.json`.
 * 본 모듈은 `@/lib/procedure-dict` 의 `categoryFor` 를 그대로 export 한 thin wrapper.
 *
 * 카테고리는 JSON entry 의 `category` 필드 (SSOT). 변경 시 JSON 만 수정.
 */
import { categoryFor } from "./procedure-dict";

/** 태그 → 카테고리 슬러그. 사전에 없으면 "knowledge". */
export function categorize(keyword: string): ReturnType<typeof categoryFor> {
  return categoryFor(keyword);
}
