/**
 * storage 안전 접근 헬퍼 (R2-3, 2026-07-04).
 *
 * 배경: 카톡·구글 등 인앱 브라우저 sandbox / 프라이빗 모드에서는 window.sessionStorage
 * "접근 자체"가 SecurityError 를 던질 수 있고, setItem 은 QuotaExceededError 가 날 수 있다.
 * 무방어 직접 접근은 화면 크래시로 이어지므로, 전 지점을 이 헬퍼로 일원화한다.
 *
 * 동작 계약 (기존 개별 try/catch 가드들과 동일):
 *   - SSR(typeof window === "undefined") / storage 접근 불가 / quota 초과 → 조용히 no-op.
 *   - get 은 실패 시 null 반환.
 *
 * 사용:
 *   import { ssGet, ssSet, ssRemove, lsGet, lsSet, lsRemove } from "@/lib/safe-storage";
 */

type StorageKind = "session" | "local";

/** storage 객체 획득 — window.sessionStorage 접근 자체가 throw 하는 환경 방어. */
function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function safeGet(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(kind: StorageKind, key: string, value: string): void {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    /* quota 초과·sandbox — no-op */
  }
}

function safeRemove(kind: StorageKind, key: string): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    /* no-op */
  }
}

// ── sessionStorage ──
export const ssGet = (key: string): string | null => safeGet("session", key);
export const ssSet = (key: string, value: string): void =>
  safeSet("session", key, value);
export const ssRemove = (key: string): void => safeRemove("session", key);

// ── localStorage ──
export const lsGet = (key: string): string | null => safeGet("local", key);
export const lsSet = (key: string, value: string): void =>
  safeSet("local", key, value);
export const lsRemove = (key: string): void => safeRemove("local", key);
