/**
 * Q&A 카드 형광펜 색 결정 — 카드 ID(또는 임의 seed) 기반 4색 파스텔 매핑.
 *
 * 한 카드는 항상 한 색 (SSR safe — 동일 seed → 동일 색).
 * Peach(주황) / Mint / Lavender / Sky Blue.
 * Yellow는 검색 본문 하이라이트와 색상이 겹쳐 제거됨 → Peach(주황)로 대체.
 *
 * QACard.tsx 와 /admin/cards/[id]/edit 미리보기에서 동일 결과를 보장하기 위해 공유.
 */

export const HIGHLIGHT_PALETTE: readonly string[] = [
  "rgba(255, 178, 102, 0.55)", // Peach (주황) — 검색 노란색과 회피
  "rgba(168, 235, 208, 0.55)", // Mint
  "rgba(212, 197, 249, 0.55)", // Lavender
  "rgba(168, 222, 255, 0.55)", // Sky Blue
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
