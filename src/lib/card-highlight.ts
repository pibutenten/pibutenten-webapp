/**
 * Q&A 카드 형광펜 색 결정 — 카드 ID(또는 임의 seed) 기반 5색 파스텔 매핑.
 *
 * 한 카드는 항상 한 색 (SSR safe — 동일 seed → 동일 색).
 * Sky / Mint / Pink / Apricot / Lavender — 모두 부드러운 톤
 *
 * 변천:
 *   - 2026-05-20: 옛 4색 rgba 0.55 → 5색 hex 100 톤 (#E0F2FE 등)
 *   - 2026-05-22: 100 톤이 너무 연해 본문에서 눈에 안 띔 → 200 톤으로 살짝 진하게
 *
 * Card.tsx 와 /admin/cards/[id]/edit 미리보기에서 동일 결과를 보장하기 위해 공유.
 */

export const HIGHLIGHT_PALETTE: readonly string[] = [
  "#BAE6FD", // Sky (하늘) — sky-200
  "#BBF7D0", // Mint (민트) — green-200
  "#FBCFE0", // Pink (분홍) — pink-200 톤다운
  "#FED7AA", // Apricot (살구) — orange-200
  "#E9D5FF", // Lavender (보라) — purple-200
];

/**
 * seed 문자열(보통 카드 id의 문자열화)로 형광펜 색 1개 결정.
 * SSR/CSR 같은 입력 → 같은 출력.
 */
export function pickHighlight(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i);
    h |= 0;
  }
  return HIGHLIGHT_PALETTE[Math.abs(h) % HIGHLIGHT_PALETTE.length];
}
