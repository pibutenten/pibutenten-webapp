/**
 * 날짜 포맷 유틸 — admin 페이지 등에서 사용하던 local formatDate 함수 통합.
 *
 * 두 가지 포맷이 필요:
 *   - YY.MM.DD (admin/cards 목록 — 짧은 표시)
 *   - YYYY-MM-DD (admin/users 상세 — ISO 앞 10자, null fallback)
 *
 * 시그니처/출력이 달라 옵션화 대신 두 함수로 분리.
 */

/** ISO 문자열 → "YY.MM.DD". 파싱 실패 시 원본 반환. */
export function formatYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

/**
 * ISO 문자열 → "YYYY-MM-DD" (앞 10자).
 * null/빈 문자열은 fallback("—" 기본).
 * 형식 검증은 하지 않음 — 호출처가 ISO 문자열을 보장.
 */
export function formatIsoDate(
  s: string | null | undefined,
  fallback: string = "—",
): string {
  return s ? s.slice(0, 10) : fallback;
}
