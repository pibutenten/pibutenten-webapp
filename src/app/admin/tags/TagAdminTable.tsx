"use client";

import { useState } from "react";
import { showToast } from "@/lib/toast";
import { formatYmd } from "@/lib/format-date";

export type TagRow = {
  id: number;
  ko: string;
  category: string;
  en: string | null;
  parent_ko: string | null;
  is_procedure: boolean;
  onboarding: string | null;
  created_at: string;
  first_card_at: string | null;
  usage: number;
  search_cnt: number;
};

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정"];
const ONBOARDING = ["", "피부고민", "피부타입", "관심시술"];

type Editable = Pick<TagRow, "category" | "en" | "parent_ko" | "is_procedure" | "onboarding">;

function Row({ row }: { row: TagRow }) {
  const [draft, setDraft] = useState<Editable>({
    category: row.category,
    en: row.en,
    parent_ko: row.parent_ko,
    is_procedure: row.is_procedure,
    onboarding: row.onboarding,
  });
  const [saved, setSaved] = useState<Editable>(draft);
  const [busy, setBusy] = useState(false);

  const dirty =
    draft.category !== saved.category ||
    (draft.en ?? "") !== (saved.en ?? "") ||
    (draft.parent_ko ?? "") !== (saved.parent_ko ?? "") ||
    draft.is_procedure !== saved.is_procedure ||
    (draft.onboarding ?? "") !== (saved.onboarding ?? "");

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tag-dictionary/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: draft.category,
          en: draft.en ?? "",
          parent_ko: draft.parent_ko ?? "",
          is_procedure: draft.is_procedure,
          onboarding: draft.onboarding ?? "",
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { message?: string } | null;
        showToast(j?.message ?? `저장 실패 (HTTP ${r.status})`, { tone: "danger" });
        return;
      }
      setSaved(draft); // optimistic 확정
      showToast(`'${row.ko}' 저장됨`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "저장 실패", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const cellInput =
    "w-full rounded border border-[var(--border)] bg-white px-1.5 py-1 text-xs";
  const createdLabel = row.first_card_at
    ? formatYmd(row.first_card_at)
    : formatYmd(row.created_at);

  return (
    <tr className={dirty ? "bg-amber-50/60" : "hover:bg-[var(--bg-soft)]"}>
      <td className="px-2 py-1.5 font-medium text-[var(--text)] whitespace-nowrap">{row.ko}</td>
      <td className="px-2 py-1.5">
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className={cellInput}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={draft.en ?? ""}
          onChange={(e) => setDraft({ ...draft, en: e.target.value })}
          placeholder="—"
          className={cellInput}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          list="tag-parent-list"
          value={draft.parent_ko ?? ""}
          onChange={(e) => setDraft({ ...draft, parent_ko: e.target.value })}
          placeholder="—"
          className={cellInput}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.is_procedure}
          onChange={(e) => setDraft({ ...draft, is_procedure: e.target.checked })}
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={draft.onboarding ?? ""}
          onChange={(e) => setDraft({ ...draft, onboarding: e.target.value })}
          className={cellInput}
        >
          {ONBOARDING.map((o) => (
            <option key={o} value={o}>{o || "—"}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.usage.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
        {row.search_cnt.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right text-[11px] text-[var(--text-muted)] whitespace-nowrap">
        {createdLabel}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className={
            "rounded px-2 py-1 text-[11px] font-medium transition-colors " +
            (dirty && !busy
              ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-active)]"
              : "cursor-default bg-[var(--bg-soft)] text-[var(--text-muted)]")
          }
        >
          {busy ? "저장중" : "저장"}
        </button>
      </td>
    </tr>
  );
}

export default function TagAdminTable({ rows }: { rows: TagRow[] }) {
  const parentList = Array.from(
    new Set(rows.filter((r) => r.is_procedure).map((r) => r.ko)),
  ).sort();
  return (
    <>
      <datalist id="tag-parent-list">
        {parentList.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
            <tr>
              <th className="px-2 py-2 text-left font-medium">태그</th>
              <th className="px-2 py-2 text-left font-medium">분류</th>
              <th className="px-2 py-2 text-left font-medium">영문</th>
              <th className="px-2 py-2 text-left font-medium">부모</th>
              <th className="px-2 py-2 text-center font-medium">시술</th>
              <th className="px-2 py-2 text-left font-medium">온보딩</th>
              <th className="px-2 py-2 text-right font-medium">사용량</th>
              <th className="px-2 py-2 text-right font-medium">검색량</th>
              <th className="px-2 py-2 text-right font-medium">생성일</th>
              <th className="px-2 py-2 text-center font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
