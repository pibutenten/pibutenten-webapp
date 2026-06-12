/**
 * 한글 초성 유틸 — 시술명 자동완성의 초성 검색용('ㅇㅆ' → '울쎄라').
 *   외부 의존성 없음. 완성형 한글(가~힣)만 초성으로 환원, 그 외 문자는 그대로 통과.
 */

// 초성 19자(유니코드 완성형 한글 배열 순서).
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHO_SET = new Set(CHO);

/** 문자열을 초성 문자열로 환원. 완성형 한글만 초성으로, 나머지는 원문 유지. */
export function chosungOf(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

/** 입력이 전부 초성 자모로만 이뤄졌는지(초성 검색 모드 판정). 공백·빈 문자열은 false. */
export function isAllChosung(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  for (const ch of t) if (!CHO_SET.has(ch)) return false;
  return true;
}
