"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { showToast } from "@/lib/toast";

export type QueueRow = { id: number; ko: string; suggested_en: string | null; source: string | null };

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정"];

function QueueItem({ row, onDone }: { row: QueueRow; onDone: (id: number) => void }) {
  const [category, setCategory] = useState("미지정");
  const [en, setEn] = useState(row.suggested_en ?? "");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("resolve_tag_review", {
        p_ko: row.ko,
        p_category: category,
        p_en: en ? en : null,
      });
      if (error) {
        showToast(`등록 실패: ${error.message}`, { tone: "danger" });
        return;
      }
      showToast(`'${row.ko}' 사전 등록됨`);
      onDone(row.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[var(--bg-soft)]">
      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.ko}</td>
      <td className="px-2 py-1.5">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-[var(--border)] bg-white px-1.5 py-1 text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={en}
          onChange={(e) => setEn(e.target.value)}
          placeholder="영문(선택)"
          className="w-full rounded border border-[var(--border)] bg-white px-1.5 py-1 text-xs"
        />
      </td>
      <td className="px-2 py-1.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">{row.source}</td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={resolve}
          disabled={busy}
          className="rounded bg-[var(--primary)] px-2 py-1 text-[11px] font-medium text-white hover:bg-[var(--primary-active)] disabled:opacity-60"
        >
          {busy ? "등록중" : "등록"}
        </button>
      </td>
    </tr>
  );
}

export default function TagQueue({ initial }: { initial: QueueRow[] }) {
  const [rows, setRows] = useState(initial);
  if (rows.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">검수 대기 태그가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
          <tr>
            <th className="px-2 py-2 text-left font-medium">태그</th>
            <th className="px-2 py-2 text-left font-medium">분류</th>
            <th className="px-2 py-2 text-left font-medium">영문</th>
            <th className="px-2 py-2 text-left font-medium">출처</th>
            <th className="px-2 py-2 text-center font-medium">처리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <QueueItem key={r.id} row={r} onDone={(id) => setRows((p) => p.filter((x) => x.id !== id))} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
