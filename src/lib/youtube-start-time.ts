/**
 * YouTube 시작 시간 파싱·포맷 헬퍼.
 *
 * Phase 2.5 (260518): admin EditClient 에 박혀 있던 헬퍼를 공통화.
 * WriteClient · EditClient · admin EditClient 셋 다 동일 규칙 사용.
 *
 * URL 패턴 지원:
 *   - https://youtu.be/{vid}?t=120
 *   - https://youtu.be/{vid}?t=120s
 *   - https://www.youtube.com/watch?v={vid}&t=2m30s
 *   - https://www.youtube.com/watch?v={vid}#t=120
 *
 * (현재 추출 정규식은 ?t=N 또는 #t=N 의 단순 초 단위만 지원. "2m30s" 같은 표기는
 *  추후 확장 — 지금 사용처가 admin/draft/publish 도 단순 초로 저장.)
 */

/** URL 에서 시작 초(`?t=Ns` 또는 `#t=Ns`) 추출. 없으면 0. */
export function extractStartSeconds(input: string): number {
  const raw = (input || "").trim();
  if (!raw) return 0;
  const m = raw.match(/[?&#](?:t|start)=(\d+)(?:s)?/i);
  if (m) return Number.parseInt(m[1], 10) || 0;
  return 0;
}

/** 초 → "MM:SS" (양수만, 음수/NaN 은 "00:00") */
export function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** "MM:SS" 또는 "M:S" 또는 순수 초 숫자 → 초. 매치 실패 0. */
export function parseMMSS(input: string): number {
  const raw = (input || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10) || 0;
  const m = raw.match(/^(\d{1,3})\s*[:.]\s*(\d{1,2})$/);
  if (m) {
    return (
      (Number.parseInt(m[1], 10) || 0) * 60 + (Number.parseInt(m[2], 10) || 0)
    );
  }
  return 0;
}

/**
 * 기존 YouTube URL 의 시작 시간을 `nextSec` 로 갱신.
 *
 * 동작:
 *   - URL 이 비어 있으면 그대로 빈 문자열 반환 (시간만 입력해도 URL 자동 생성 X — 별 영상 없으므로)
 *   - nextSec === 0 → URL 에서 `?t=` / `&t=` / `#t=` 제거 (정규형)
 *   - nextSec > 0  → 기존 `t` 파라미터 갱신 또는 추가
 *
 * URL 이 invalid 면 그대로 반환 (사용자가 손으로 적은 노이즈 보존).
 */
export function setStartSecondsOnUrl(url: string, nextSec: number): string {
  const raw = (url || "").trim();
  if (!raw) return raw;
  // hash·query 둘 다 처리. 단순 정규식으로 처리해 invalid URL 도 살림.
  // 1) 기존 t 제거
  let out = raw.replace(/([?&#])(t|start)=\d+s?/gi, "$1");
  // 2) 빈 ?/&/# 정리 — '?' 뒤에 아무것도 없거나 '&&' 가 되는 경우.
  out = out.replace(/\?(&|#|$)/, "$1").replace(/&{2,}/g, "&").replace(/&#/, "#");
  // 끝의 trailing &?# 제거
  out = out.replace(/[?&#]+$/, "");
  if (nextSec <= 0) return out;
  // 3) 새 t 추가
  const sep = out.includes("?") ? "&" : "?";
  return `${out}${sep}t=${Math.floor(nextSec)}`;
}
