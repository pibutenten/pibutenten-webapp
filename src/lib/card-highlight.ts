/**
 * Q&A 카드 형광펜 색 결정 — 카드 ID(또는 임의 seed) 기반 5색 파스텔 매핑.
 *
 * 한 카드는 항상 한 색 (SSR safe — 동일 seed → 동일 색).
 * Sky / Mint / Pink / Apricot / Lavender — 모두 부드러운 톤
 * (2026-05-20 사용자 결정 — 옛 4색 rgba 0.55 → 5색 hex 라이트 톤).
 *
 * Card.tsx 와 /admin/cards/[id]/edit 미리보기에서 동일 결과를 보장하기 위해 공유.
 */

export const HIGHLIGHT_PALETTE: readonly string[] = [
  "#E0F2FE", // Sky (하늘)
  "#DCFCE7", // Mint (민트)
  "#FFEBF2", // Pink (분홍)
  "#FFEDD5", // Apricot (살구)
  "#F3E8FF", // Lavender (보라)
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
