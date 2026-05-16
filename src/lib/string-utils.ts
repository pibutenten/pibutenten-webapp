/**
 * 문자열 유틸 — 여러 곳에 중복돼 있던 truncate 통합.
 *
 * 동작: 빈/falsy 입력은 "", 길이가 n 초과면 n자 + "…", 아니면 원본.
 * (admin/cards 의 ">" 와 ai/step2 의 "<=" 차이는 동작상 동등 — n자가 한계.)
 */

/** s 의 길이가 n 자 초과면 n자만 잘라 "…" 붙임. 입력이 falsy 면 "". */
export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
