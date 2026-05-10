/**
 * YouTube URL의 timestamp 파라미터를 초 단위로 추출.
 *
 * 지원 형식:
 *  - ?t=120 또는 &t=120 (정수 초)
 *  - ?t=2m30s, ?t=1h2m3s, ?t=90s
 *  - ?start=120 (embed 형식)
 *
 * @returns 초 단위 정수, 또는 null (timestamp 없음 / 파싱 실패)
 */
export function parseYoutubeTimestamp(url: string | null | undefined): number | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const raw = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    // 1h2m3s / 2m30s / 90s
    const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m) return null;
    const h = parseInt(m[1] ?? "0", 10);
    const min = parseInt(m[2] ?? "0", 10);
    const s = parseInt(m[3] ?? "0", 10);
    const total = h * 3600 + min * 60 + s;
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

/** 초 → "0:30" / "1:23" / "1:02:34" 표시 형식 */
export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}
