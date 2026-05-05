/**
 * Article slug 유틸 — 한글 제목을 URL-safe 문자열로 변환
 */

/**
 * 한글/영문 제목 → 슬러그.
 * - 한글은 유지 (인코딩은 브라우저가 함)
 * - 공백 → "-"
 * - 특수문자 제거
 * - 끝에 6자 random suffix 붙여 충돌 회피
 */
export function makeArticleSlug(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // 한글·영문·숫자·공백·하이픈만
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40); // 최대 40자
  const suffix = randomSuffix(6);
  return base ? `${base}-${suffix}` : suffix;
}

function randomSuffix(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
