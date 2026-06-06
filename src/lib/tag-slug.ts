/**
 * 태그 영문(en) 슬러그 정규화 (E1, 2026-06-06).
 *
 * 태그 매니저 영문 컬럼 입력을 일관 slug 로 강제 — 서버(PATCH route)·클라이언트 저장 양쪽 공유.
 * 규칙: 양끝 공백 제거 → 소문자 → 공백(연속 포함)을 하이픈 1개 → 영문/숫자/하이픈 외 제거
 *       → 연속 하이픈 1개 → 양끝 하이픈 제거.
 * 예) "Centella Asiatica" → "centella-asiatica".
 */
export function slugifyEn(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
