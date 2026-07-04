/**
 * 피부텐텐 시술명/태그 사전 — 클라이언트 안전 lookup (R4-3).
 *
 * 전체 스냅샷(`tag-dictionary.generated.json`, ~200KB — pubmed·pubmedLookup·aliases·autotag
 * 포함)은 서버 전용입니다. 이 모듈은 경량 클라 스냅샷 `tag-dictionary.client.generated.json`
 * (category·slug·blacklist·normalizations — gen-tag-dictionary.mjs 가 전체 스냅샷과 같은
 * 객체에서 동시 투영 생성, 항상 동일 데이터)만 읽어 클라이언트 번들에 서버 전용 데이터가
 * 실리지 않게 합니다.
 *
 * 구현은 여기 한 곳뿐이며, 서버 진입점 `./procedure-dict` 가 아래 함수들을 re-export 합니다
 * (서버 코드는 기존 import 경로 그대로 사용).
 *
 *  - categoryFor(keyword)  — 키워드 → 9분류 카테고리 슬러그
 *  - normalizeTag(rawTag)  — 합성어/표기 → 정규화된 태그 배열 (블랙리스트면 빈 배열)
 *  - normalizeTags(tags)   — 배열 정규화 + 중복 제거
 *  - isBlacklisted(tag)    — 블랙리스트 포함 여부
 *
 * pubmed 계열(pubmedKeywordsFor·getPubmedDict)과 slugFor 는 서버 전용 `./procedure-dict` 에
 * 있습니다. 클라이언트 컴포넌트에서 그쪽을 import 하면 전체 스냅샷이 번들에 다시 실립니다.
 */

import snapshot from "@/data/tag-dictionary.client.generated.json";
import type { CategorySlug } from "./categories";

// ── 빌드타임 클라 스냅샷 (전체 스냅샷의 클라 사용 필드 투영) ──
const SNAP = snapshot as unknown as {
  category: Record<string, string>;
  slug: Record<string, string>; // ko → 영문 slug (이 모듈은 미사용 — slug-mapping.ts 가 소비. 타입 명시는 검수 권고)
  blacklist: string[];
  normalizations: Record<string, string[]>; // 변형어 → 정규화 결과
};
const SNAP_CATEGORY = SNAP.category;
const SNAP_BLACKLIST = new Set<string>(SNAP.blacklist);

// ── public API ───────────────────────────────────────────────

/** 키워드 → 9분류 카테고리 슬러그. 사전에 없으면 "knowledge". (DB 스냅샷 기준) */
export function categoryFor(keyword: string): CategorySlug {
  const cat = SNAP_CATEGORY[keyword];
  if (
    cat === "lifting" ||
    cat === "skinbooster" ||
    cat === "filler" ||
    cat === "contour" ||
    cat === "laser" ||
    cat === "other" ||
    cat === "concerns" ||
    cat === "homecare" ||
    cat === "knowledge"
  ) {
    return cat;
  }
  return "knowledge";
}

/** 정규화 룰 + 블랙리스트 적용. 한 raw → 결과 배열 (빈 배열 = 제거). (DB 스냅샷 기준) */
export function normalizeTag(raw: string): string[] {
  const v = (raw ?? "").trim().replace(/^#/, "");
  if (!v) return [];
  if (SNAP_BLACKLIST.has(v)) return [];
  if (v in SNAP.normalizations) return SNAP.normalizations[v];
  return [v];
}

/** 태그 배열 정규화 + 중복 제거 + 순서 보존. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    for (const norm of normalizeTag(raw)) {
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
  }
  return out;
}

/** 블랙리스트 포함 여부. (DB 스냅샷 기준) */
export function isBlacklisted(tag: string): boolean {
  return SNAP_BLACKLIST.has(tag);
}
