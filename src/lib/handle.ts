/**
 * 회원 핸들(handle) — URL 식별자. 의사 slug와 1:1.
 *
 * 형식: 3-30자, lowercase 영숫자 + 하이픈, 양 끝은 영숫자.
 * Reserved handles는 DB의 public.reserved_handles 테이블 + trigger로 보호.
 */

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export function isValidHandle(s: string | null | undefined): boolean {
  return typeof s === "string" && HANDLE_PATTERN.test(s);
}

/**
 * 임의 문자열을 handle 후보로 정규화.
 *  - 한글·특수문자 → 제거
 *  - 대문자 → 소문자
 *  - 공백·언더스코어 → 하이픈
 *  - 연속 하이픈 → 하나
 *  - 양 끝 하이픈 → 제거
 *  - 3자 미만이면 빈 문자열
 *  - 30자 초과 시 30자로 잘라냄
 */
export function normalizeHandleCandidate(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase();
  // 공백·언더스코어를 하이픈으로
  s = s.replace(/[\s_]+/g, "-");
  // 영숫자+하이픈만 남김
  s = s.replace(/[^a-z0-9-]/g, "");
  // 연속 하이픈 정리
  s = s.replace(/-+/g, "-");
  // 양 끝 하이픈 제거
  s = s.replace(/^-+|-+$/g, "");
  if (s.length < 3) return "";
  if (s.length > 30) s = s.slice(0, 30).replace(/-+$/, "");
  return s;
}

