/**
 * 피부텐텐 시술명/태그 통합 사전 — 단일 SSOT.
 *
 * 소스: DB `tag_dictionary`(+tag_blacklist·tag_normalization) → 빌드타임 스냅샷
 *   `src/data/tag-dictionary.generated.json` (gen-tag-dictionary.mjs). 모든 lookup 이 스냅샷 기준.
 *   `procedure-mappings.json` 은 스냅샷 베이스라인 + allMappings() 전용(L2-4 정리 예정).
 *
 * 이 모듈이 제공하는 단일 진입점을 통해 lookup 하세요.
 *
 *  - categoryFor(keyword)         — 키워드 → 5분류 카테고리(lifting/injectables/concerns/homecare/knowledge)
 *  - slugFor(keyword)             — 한글 키워드 → URL slug (영문)
 *  - pubmedKeywordsFor(keyword)   — 키워드 → PubMed 영문 검색어 배열 (없으면 null)
 *  - normalizeTag(rawTag)         — 합성어/표기 → 정규화된 태그 배열 (블랙리스트면 빈 배열)
 *  - normalizeTags(tags)          — 배열 정규화 + 중복 제거
 *  - isBlacklisted(tag)           — 블랙리스트 포함 여부
 *  - allMappings()                — 전체 entry 배열 (read-only)
 *
 * 다른 모듈(category-sets, tag-dictionary)은 이 파일을 thin wrapper 로 사용.
 *
 * 신규 시술명 추가:
 *   1) procedure-mappings.json 의 mappings 에 entry 추가
 *   2) (선택) pubmedKeywords / synonyms 필드 추가
 *   3) 코드 변경 불필요 — 이 모듈이 자동 반영
 */

import raw from "@/data/procedure-mappings/procedure-mappings.json";
import snapshot from "@/data/tag-dictionary.generated.json";
import type { CategorySlug } from "./categories";

type Mapping = {
  ko: string;
  en: string;
  category: string;
  type: string;
  synonyms?: string[];
  notes?: string;
  pubmedKeywords?: string[];
};

// procedure-mappings.json: allMappings() (디버그·관리자 도구) 전용. 나머지 lookup 은 스냅샷 사용.
const data = raw as unknown as { mappings: Mapping[] };

// ── 빌드타임 스냅샷 (SSOT=DB tag_dictionary ⊕ JSON 베이스라인) ──
//   categoryFor/slugFor/pubmedKeywordsFor/normalizeTag/isBlacklisted/getPubmedDict 모두 이 스냅샷을 읽는다
//   (동기·시그니처 불변). 생성: scripts/gen-tag-dictionary.mjs (package.json prebuild).
//   DB 미접근 시 커밋된 스냅샷 보존. JSON 베이스라인 ⊕ DB union 으로 전환 전후 동일 보장(_parity-check).
const SNAP = snapshot as unknown as {
  category: Record<string, string>;
  slug: Record<string, string>;
  pubmed: Record<string, string[]>; // ko(canonical) → PubMed (getPubmedDict)
  pubmedLookup: Record<string, string[]>; // ko/synonym/alias → PubMed (pubmedKeywordsFor)
  blacklist: string[];
  normalizations: Record<string, string[]>; // 변형어 → 정규화 결과
};
const SNAP_CATEGORY = SNAP.category;
const SNAP_SLUG = SNAP.slug;
const SNAP_BLACKLIST = new Set<string>(SNAP.blacklist);

// ── public API ───────────────────────────────────────────────

/** 키워드 → 5분류 카테고리 슬러그. 사전에 없으면 "knowledge". (DB 스냅샷 기준) */
export function categoryFor(keyword: string): CategorySlug {
  const cat = SNAP_CATEGORY[keyword];
  if (
    cat === "lifting" ||
    cat === "injectables" ||
    cat === "concerns" ||
    cat === "homecare" ||
    cat === "knowledge"
  ) {
    return cat;
  }
  return "knowledge";
}

/** 한글 키워드 → 영문 slug. 사전에 없으면 null. (DB 스냅샷 기준) */
export function slugFor(keyword: string): string | null {
  return SNAP_SLUG[keyword] ?? null;
}

/** 키워드 → PubMed 영문 검색어 배열. 사전에 없거나 항목 없으면 null. (DB 스냅샷 기준) */
export function pubmedKeywordsFor(keyword: string): string[] | null {
  return SNAP.pubmedLookup[keyword] ?? null;
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

/** 전체 entry 배열 (read-only). 디버그/관리자 도구용. (procedure-mappings.json — L2-4 에서 정리 예정) */
export function allMappings(): readonly Mapping[] {
  return data.mappings;
}

/** PubMed dict 전체 (canonical ko → 검색어) — step1_v5 프롬프트 빌드 시 사용. (DB 스냅샷 기준) */
export function getPubmedDict(): Record<string, string[]> {
  return { ...SNAP.pubmed };
}
