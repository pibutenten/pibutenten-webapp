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

/** JSON.parse 직후 런타임 검증 — 손상 row(수동 편집·구버전 잔재)는 호출부가 removeItem 으로 자정한다. */
function isValidDraft(data: unknown): data is DraftData {
  const d = data as DraftData | null;
  return (
    typeof d?.savedAt === "number" &&
    Number.isFinite(d.savedAt) &&
    !!d.fields &&
    typeof d.fields === "object"
  );
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
    const data: unknown = JSON.parse(raw);
    // 손상 row(스키마 불일치)는 만료와 동일하게 제거 후 null — 화면 크래시 방지.
    if (!isValidDraft(data)) {
      localStorage.removeItem(key(formType));
      return null;
    }
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
  const removable: string[] = []; // 만료 + 손상 row — 순회 후 일괄 제거(순회 중 index 흔들림 방지).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data: unknown = JSON.parse(raw);
      // 손상 row(스키마 불일치)는 만료와 동일하게 제거 대상 — 화면 크래시 방지.
      if (!isValidDraft(data) || Date.now() - data.savedAt > MAX_AGE_MS) {
        removable.push(k);
        continue;
      }
      drafts.push(data);
    }
    for (const k of removable) localStorage.removeItem(k);
  } catch { /* ignore */ }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

// (2026-07-02) cleanupExpiredDrafts 삭제 — 외부 사용처 0건 + loadDraft/listDrafts 가 만료·손상 정리를 이미 수행.
