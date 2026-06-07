/**
 * 자동 태그 추출 — AI 없이, DB 스냅샷(tag-dictionary.generated.json) 사전 매칭으로.
 *
 * 동작:
 *   1) DB tag_dictionary 의 is_recommendable=true 대표어(ko) + aliases 를 사전으로 사용
 *   2) 본문(+ 외부 메타 description)에서 매칭 빈도·길이 가중치로 정렬
 *   3) 상위 N개 태그 반환 (기본 5개)
 *
 * 의도적으로 AI 호출 없음 — 비용 0, 즉시 응답.
 *
 * ⚠️ 호출 분기 정책 (2026-05-17):
 *   - **회원 글쓰기 (`/write`, `WriteClient`)**: 이 `extractAutoTags()` 만 사용 (즉시 + 무료).
 *   - **admin AI 초안 검수 (`/admin/draft`, `/admin/cards/[id]/edit`)**: `/api/admin/extract-keywords`
 *     (Claude 호출) 도 사용 가능. 시술명 사전에 없는 신규 키워드 추출이 강점.
 *
 *   두 경로는 **상호 배타**. 동일 글에 둘 다 호출하지 말 것 (UX 혼란 + 중복 비용).
 *   AI 라우트는 admin 전용이며, 일반 회원 글쓰기 흐름에 절대 추가하지 말 것.
 */
import snapshot from "@/data/tag-dictionary.generated.json";

/** 사전 항목 — 대표어 ko + aliases 를 펼쳐 후보 태그 풀 구성 */
type DictEntry = {
  /** 사용자에게 노출되는 태그명 (대표어 한국어) */
  display: string;
  /** 원문에서 검색할 변형들 (ko + aliases) */
  variants: string[];
};

// 빌드타임 DB 스냅샷(generated.json)의 autotag = is_recommendable=true 대표어만.
// gen-tag-dictionary.mjs 가 {display:ko, variants:[ko,...aliases]} 로 산출(영문 약어 RF 등은 aliases 매칭).
const DICT: DictEntry[] = (snapshot as { autotag: DictEntry[] }).autotag;

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
