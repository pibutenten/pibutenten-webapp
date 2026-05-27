/**
 * Q&A 본문(`**bold**` + `\n\n` 단락)에서 마크다운 문법을 제거해 plain text 반환.
 *
 * 사용처:
 *  - <meta name="description">, og:description, twitter:description
 *  - JSON-LD acceptedAnswer.text (Schema.org Answer)
 *  - 검색 결과 / 미리보기 카드의 raw 텍스트
 *
 * 변환 규칙:
 *  - 옛 본문 끝 평문 "참고문헌\n1. ..." 꼬리 제거 (Critical-6, 2026-05-27) — pubmed_refs 가 SSOT
 *  - `**foo**` → `foo`
 *  - `*foo*`   → `foo` (단일 별표 강조도 제거. 우리 카드엔 보통 X이지만 안전)
 *  - `__foo__` → `foo`
 *  - `` `foo` `` → `foo`
 *  - 연속 공백 1칸 압축, 양옆 trim
 */
export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return "";
  return s
    // Critical-6: 본문 끝 평문 참고문헌 꼬리 잘라내기 (메타데이터에 ref 평문 노출 차단).
    // 매치 패턴은 card-render.tsx 의 stripLegacyReferencesTail 과 동일.
    .replace(/\n+참고문헌\s*\n(?:\s*\d+\.\s+[^\n]+\n?)+\s*$/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n][^*\n]*?)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
