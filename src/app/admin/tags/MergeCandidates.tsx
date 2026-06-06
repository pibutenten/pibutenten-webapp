"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";

export type MergeCandidate = {
  id: number;
  engKo: string;
  repKo: string;
  cards: number;
};

/**
 * 영문 → 한글 대표어 병합 후보 검토 (F-Phase2 일괄).
 * slugifyEn(영문 ko) 가 한글 대표어의 en 과 일치하는 쌍. 체크 후 [선택 병합] 시
 * 각 쌍을 merge API(confirm=true)로 순차 실행 → router.refresh.
 */
export default function MergeCandidates({ candidates }: { candidates: MergeCandidate[] }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) return null;

  const allOn = checked.size === candidates.length;

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setChecked(allOn ? new Set() : new Set(candidates.map((c) => c.id)));
  }

  async function dismiss(c: MergeCandidate) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tag-dictionary/merge-dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ko: c.engKo }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { message?: string } | null;
        showToast(j?.message ?? `제외 실패 (HTTP ${r.status})`, { tone: "danger" });
        return;
      }
      showToast(`'${c.engKo}' 병합 후보에서 제외됨`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function mergeSelected() {
    const targets = candidates.filter((c) => checked.has(c.id));
    if (targets.length === 0) {
      showToast("병합할 항목을 선택해 주세요.", { tone: "danger" });
      return;
    }
    setBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      // 순차 실행 — 각 병합은 단일 tx. 실패해도 나머지 진행.
      for (const c of targets) {
        try {
          const r = await fetch(`/api/admin/tag-dictionary/${c.id}/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetKo: c.repKo, confirm: true }),
          });
          if (r.ok) ok += 1;
          else fail += 1;
        } catch {
          fail += 1;
        }
      }
      showToast(`병합 완료 ${ok}건${fail ? ` · 실패 ${fail}건` : ""}`, {
        tone: fail ? "danger" : undefined,
      });
      setChecked(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mb-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50/40">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-800">
        영문 → 한글 대표어 병합 후보 {candidates.length}쌍
        <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
          (영문 태그를 한글 대표어로 흡수 · 원태그 삭제)
        </span>
      </summary>
      <div className="border-t border-amber-200 p-3">
        <div className="mb-2 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={allOn} onChange={toggleAll} />
            전체 선택
          </label>
          <button
            type="button"
            onClick={mergeSelected}
            disabled={busy || checked.size === 0}
            className={
              "ml-auto rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors " +
              (busy || checked.size === 0
                ? "cursor-default bg-[var(--bg-soft)] text-[var(--text-muted)]"
                : "bg-[var(--primary-active)] text-white hover:opacity-90")
            }
          >
            {busy ? "병합 중…" : `선택 병합 (${checked.size})`}
          </button>
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-white">
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="font-medium text-[var(--text)]">{c.engKo}</span>
                <span className="text-[var(--text-muted)]">→</span>
                <span className="font-medium text-[var(--primary)]">{c.repKo}</span>
                <span className="ml-auto tabular-nums text-[11px] text-[var(--text-muted)]">
                  카드 {c.cards.toLocaleString()}
                </span>
              </label>
              <button
                type="button"
                onClick={() => dismiss(c)}
                disabled={busy}
                title="이 후보를 무시(재유입돼도 후보로 안 뜸)"
                className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
              >
                제외
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
