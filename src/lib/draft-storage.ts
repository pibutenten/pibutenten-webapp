/**
 * 글쓰기 임시저장 — localStorage 기반.
 *
 * 키: pbtt:draft:v1:{formType}
 * formType: "doodle" | "qa" | "review"
 * 30일 이상 된 임시저장은 자동 정리.
 */

const PREFIX = "pbtt:draft:v1:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftFormType = "doodle" | "qa" | "review";

export interface DraftData {
  formType: DraftFormType;
  savedAt: number;
  fields: Record<string, unknown>;
}

function key(formType: DraftFormType): string {
  return `${PREFIX}${formType}`;
}

export function saveDraft(formType: DraftFormType, fields: Record<string, unknown>): void {
  try {
    const data: DraftData = { formType, savedAt: Date.now(), fields };
    localStorage.setItem(key(formType), JSON.stringify(data));
  } catch { /* quota 초과 등 무시 */ }
}

export function loadDraft(formType: DraftFormType): DraftData | null {
  try {
    const raw = localStorage.getItem(key(formType));
    if (!raw) return null;
    const data: DraftData = JSON.parse(raw);
    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key(formType));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function deleteDraft(formType: DraftFormType): void {
  try {
    localStorage.removeItem(key(formType));
  } catch { /* ignore */ }
}

export function listDrafts(): DraftData[] {
  const drafts: DraftData[] = [];
  const expired: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data: DraftData = JSON.parse(raw);
      if (Date.now() - data.savedAt > MAX_AGE_MS) {
        expired.push(k);
        continue;
      }
      drafts.push(data);
    }
    for (const k of expired) localStorage.removeItem(k);
  } catch { /* ignore */ }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export function cleanupExpiredDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data: DraftData = JSON.parse(raw);
      if (Date.now() - data.savedAt > MAX_AGE_MS) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}
