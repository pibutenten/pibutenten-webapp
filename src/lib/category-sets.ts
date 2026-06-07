/**
 * 태그 → 카테고리 매핑 (호환 API).
 *
 * 통합 SSOT: DB `tag_dictionary` → 빌드타임 스냅샷 `tag-dictionary.generated.json`.
 * 본 모듈은 `@/lib/procedure-dict` 의 `categoryFor` 를 그대로 export 한 thin wrapper.
 *
 * 카테고리는 tag_dictionary.category (SSOT). 변경 시 DB 수정 → prebuild 스냅샷 재생성.
 */
import { categoryFor } from "./procedure-dict";

/** 태그 → 카테고리 슬러그. 사전에 없으면 "knowledge". */
export function categorize(keyword: string): ReturnType<typeof categoryFor> {
  return categoryFor(keyword);
}
