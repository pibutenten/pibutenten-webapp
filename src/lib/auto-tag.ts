/**
 * 자동 태그 추출 — AI 없이, procedure-mappings.json 사전 매칭으로.
 *
 * 동작:
 *   1) procedure-mappings.json의 한국어 키워드(ko) + synonyms를 사전으로 사용
 *   2) 본문(+ 외부 메타 description)에서 매칭 빈도·길이 가중치로 정렬
 *   3) 상위 N개 태그 반환 (기본 5개)
 *
 * 의도적으로 AI 호출 없음 — 비용 0, 즉시 응답.
 */
import mappings from "@/data/procedure-mappings/procedure-mappings.json";

type Mapping = {
  ko: string;
  en: string;
  category: string;
  type: string;
  synonyms?: string[];
  notes?: string;
};

type RawData = {
  mappings: Mapping[];
};

/** 사전 항목 — ko + synonyms를 모두 펼쳐서 후보 태그 풀 구성 */
type DictEntry = {
  /** 사용자에게 노출되는 태그명 (정규화된 한국어) */
  display: string;
  /** 원문에서 검색할 변형들 (ko + synonyms) */
  variants: string[];
};

const RAW = mappings as RawData;

const DICT: DictEntry[] = RAW.mappings.map((m) => {
  const variants = [m.ko, ...(m.synonyms ?? [])].filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  return {
    display: m.ko, // ko를 그대로 표시 (영문 약어 RF 등은 synonym에서 매칭됨)
    variants,
  };
});

/** 매칭 시 최소 키워드 길이 — 너무 짧은 단어(예: "실")의 false positive 방지 */
const MIN_KEYWORD_LEN = 2;

export type ExtractOptions = {
  /** 최대 추출 개수 (기본 5) */
  limit?: number;
  /** 이미 입력된 태그(중복 제외용) */
  exclude?: string[];
};

/**
 * 텍스트에서 사전 매칭으로 태그 추출.
 * @param text 본문 + 메타 description 등을 합친 원문
 */
export function extractTagsFromText(
  text: string,
  options: ExtractOptions = {},
): string[] {
  const limit = options.limit ?? 5;
  const exclude = new Set(
    (options.exclude ?? []).map((s) => s.trim().toLowerCase()),
  );

  if (!text || typeof text !== "string") return [];

  // 검색 효율 — 소문자화 (영문 약어 매칭용). 한글은 영향 없음.
  const haystack = text.toLowerCase();

  type Hit = { display: string; score: number };
  const hits: Hit[] = [];
  const seen = new Set<string>();

  for (const entry of DICT) {
    if (seen.has(entry.display)) continue;
    let bestCount = 0;
    let bestLen = 0;
    for (const v of entry.variants) {
      if (v.length < MIN_KEYWORD_LEN) continue;
      const needle = v.toLowerCase();
      if (!haystack.includes(needle)) continue;
      // 등장 횟수 — 단순 split count
      const count = haystack.split(needle).length - 1;
      if (count > bestCount) bestCount = count;
      if (v.length > bestLen) bestLen = v.length;
    }
    if (bestCount > 0) {
      // 점수 = 등장빈도 × (1 + 키워드 길이 가중치)
      // 더 긴 키워드(고유 브랜드명 등)에 가중치 — "필러"보다 "쥬베덤" 같은 게 우선
      const score = bestCount * (1 + bestLen * 0.3);
      hits.push({ display: entry.display, score });
      seen.add(entry.display);
    }
  }

  hits.sort((a, b) => b.score - a.score);

  const result: string[] = [];
  for (const h of hits) {
    if (exclude.has(h.display.toLowerCase())) continue;
    result.push(h.display);
    if (result.length >= limit) break;
  }
  return result;
}
