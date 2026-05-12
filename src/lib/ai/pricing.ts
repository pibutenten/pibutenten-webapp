/**
 * Anthropic Claude 모델별 토큰 단가 — USD per 1M tokens.
 *
 * 가격 출처: https://www.anthropic.com/pricing  (Claude Opus 4 기준)
 *  - input: $15 / 1M
 *  - output: $75 / 1M
 *  - cache write: input × 1.25
 *  - cache read: input × 0.1
 *
 * 가격이 변하면 이 파일만 수정.
 */

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type ModelPrice = {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
};

// Claude Opus 4 (claude-opus-4-* 시리즈)
const OPUS_4: ModelPrice = {
  input: 15,
  output: 75,
  cacheWrite: 18.75, // input × 1.25
  cacheRead: 1.5, // input × 0.1
};

const PRICES: Record<string, ModelPrice> = {
  "claude-opus-4-7": OPUS_4,
  "claude-opus-4-6": OPUS_4,
  "claude-opus-4-5": OPUS_4,
  "claude-opus-4-0": OPUS_4,
};

const DEFAULT_PRICE = OPUS_4;

/** model id → 단가. 알려지지 않은 모델은 Opus 4 단가로 폴백. */
export function priceFor(model: string): ModelPrice {
  return PRICES[model] ?? DEFAULT_PRICE;
}

/** usage → USD 비용 (cache_creation, cache_read 가산). */
export function costUSD(model: string, usage: UsageLike): number {
  const p = priceFor(model);
  // input_tokens 는 Anthropic 응답에서 "cache 외 일반 input" — cache_creation/read는 별도 카운트
  const inputCost = ((usage.input_tokens ?? 0) * p.input) / 1_000_000;
  const outputCost = ((usage.output_tokens ?? 0) * p.output) / 1_000_000;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) * (p.cacheWrite ?? p.input)) /
    1_000_000;
  const cacheReadCost =
    ((usage.cache_read_input_tokens ?? 0) * (p.cacheRead ?? p.input)) /
    1_000_000;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/** USD 금액 포맷 — 4자리, $0.0001 이상이면 $0.0125 같이, 미만이면 $<0.0001. */
export function formatUSD(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "$0";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** 토큰 수 천 단위 콤마 포맷. */
export function formatTokens(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}
