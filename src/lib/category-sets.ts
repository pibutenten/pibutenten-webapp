/**
 * 태그 → 카테고리 매핑 (호환 API).
 *
 * 통합 SSOT: DB `tag_dictionary` → 빌드타임 스냅샷.
 * 본 모듈은 `@/lib/procedure-dict.client` 의 `categoryFor` 를 그대로 export 한 thin wrapper.
 *   (R4-3: 클라 컴포넌트가 categorize 를 쓰므로 경량 클라 스냅샷 소비 모듈에 연결 —
 *    전체 스냅샷 ~200KB 가 클라 번들에 실리지 않게 한다. 서버에서 써도 데이터 동일.)
 *
 * 카테고리는 tag_dictionary.category (SSOT). 변경 시 DB 수정 → prebuild 스냅샷 재생성.
 */
import { categoryFor } from "./procedure-dict.client";

/** 태그 → 카테고리 슬러그. 사전에 없으면 "knowledge". */
export function categorize(keyword: string): ReturnType<typeof categoryFor> {
  return categoryFor(keyword);
}
