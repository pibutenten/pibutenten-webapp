/**
 * 답변 본문 정규화 — Q&A 편집기·포스팅 편집기 공용.
 *
 * 규칙:
 *   1) 줄 끝 공백 제거
 *   2) 3줄 이상 연속 빈 줄을 1줄 빈 줄로 압축 (단락 구분은 유지)
 *   3) 첫·마지막 빈 줄 제거
 *
 * 단순히 `\n{3,}` → `\n\n`만 적용하면 한 단락 안에 빈 줄이 끼는 경우가 남으므로
 * "단락 구분(2개 줄바꿈) 유지 + 그 이상은 제거"로 정규화한다.
 */
export function normalizeAnswerBody(s: string): string {
  if (!s) return "";
  return s
    .replace(/\r\n/g, "\n")            // Windows 줄바꿈 통일
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "")) // 줄 끝 공백 제거
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")        // 빈 줄 1개만 허용
    .replace(/^\n+/, "")               // 시작 빈 줄 제거
    .replace(/\n+$/, "");              // 끝 빈 줄 제거
}
