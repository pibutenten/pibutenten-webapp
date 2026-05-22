/**
 * Q&A 카드 형광펜 색 결정 — 카드 ID(또는 임의 seed) 기반 5색 파스텔 매핑.
 *
 * 한 카드는 항상 한 색 (SSR safe — 동일 seed → 동일 색).
 * Sky / Mint / Pink / Apricot / Lavender — 모두 부드러운 톤
 *
 * 변천:
 *   - 2026-05-20: 옛 4색 rgba 0.55 → 5색 hex 100 톤 (#E0F2FE 등)
 *   - 2026-05-22 v1: 100 톤 너무 연함 → 200 톤 (#BAE6FD 등)
 *   - 2026-05-22 v2: 200 톤 너무 강함 → 100/200 사이 중간 톤 (Tailwind 150 자리)
 *
 * Card.tsx 와 /admin/cards/[id]/edit 미리보기에서 동일 결과를 보장하기 위해 공유.
 */

export const HIGHLIGHT_PALETTE: readonly string[] = [
  "#CDECFE", // Sky (하늘) — 100/200 중간
  "#CCFAD9", // Mint (민트)
  "#FDDDE9", // Pink (분홍)
  "#FEE2BF", // Apricot (살구)
  "#EEDFFF", // Lavender (보라)
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
