/**
 * 검색 — 내 최근 검색어 (localStorage, 클라 전용).
 * 비로그인 포함 누구나 사용. 기기/브라우저 한정. 최대 10개.
 */
const KEY = "pbtt:recent-search";
const MAX = 10;

export function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addRecent(q: string): void {
  const t = q.trim();
  if (!t || typeof window === "undefined") return;
  const next = [t, ...getRecent().filter((x) => x !== t)].slice(0, MAX);
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
}

export function removeRecent(q: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(getRecent().filter((x) => x !== q))); } catch { /* noop */ }
}

export function clearRecent(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
}
