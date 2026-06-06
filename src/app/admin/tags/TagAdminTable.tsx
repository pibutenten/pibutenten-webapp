"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
// 온보딩 4종 — 얼굴형·피부타입·피부고민·관심시술 (얼굴형 추가, 2026-06-06).
const ONBOARDING = ["", "얼굴형", "피부타입", "피부고민", "관심시술"];

type SortCol = "usage" | "search" | "created";

/** 개별 필드 PATCH (보낸 필드만 갱신). 성공 true. 실패 시 toast 후 false. */
async function patchField(id: number, body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`/api/admin/tag-dictionary/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { message?: string } | null;
      showToast(j?.message ?? `저장 실패 (HTTP ${r.status})`, { tone: "danger" });
      return false;
    }
    return true;
  } catch (e) {
    showToast(e instanceof Error ? e.message : "저장 실패", { tone: "danger" });
    return false;
  }
}

const cellBox =
  "w-full rounded border border-[var(--border)] bg-white px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none";
const displayBox =
  "block w-full cursor-text rounded px-1.5 py-1 text-xs hover:bg-[var(--bg-soft)] min-h-[26px]";

/** 텍스트 셀 — 표시값 클릭 시 그 자리 input(F2식). Enter/blur 저장, Esc 취소. */
function TextCell({
  value,
  placeholder,
  list,
  validate,
  onSave,
}: {
  value: string;
  placeholder?: string;
  list?: string;
  /** 저장 전 검증. 메시지 반환 시 거부(toast). null 이면 통과. */
  validate?: (v: string) => string | null;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  async function commit() {
    const v = draft.trim();
    if (v === value) {
      setEditing(false);
      return;
    }
    if (validate) {
      const msg = validate(v);
      if (msg) {
        showToast(msg, { tone: "danger" });
        return; // 편집 유지
      }
    }
    const ok = await onSave(v);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            setDraft(value);
            setEditing(true);
          }
        }}
        className={displayBox + (value ? "" : " text-[var(--text-muted)]")}
        title="클릭하여 편집"
      >
        {value || placeholder || "—"}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      list={list}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      className={cellBox}
    />
  );
}

/** 셀렉트 셀 — 표시값 클릭 시 select 노출. 변경 즉시 저장. */
function SelectCell({
  value,
  options,
  onSave,
}: {
  value: string;
  options: string[];
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") setEditing(true);
        }}
        className={displayBox + (value ? "" : " text-[var(--text-muted)]")}
        title="클릭하여 편집"
      >
        {value || "—"}
      </span>
    );
  }
  return (
    <select
      ref={ref}
      defaultValue={value}
      onBlur={() => setEditing(false)}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === value) {
          setEditing(false);
          return;
        }
        const ok = await onSave(v);
        if (ok) setEditing(false);
      }}
      className={cellBox}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
    </select>
  );
}

/** 태그(ko) rename — 위험 작업이라 미리보기 게이트 모달로 분리. */
function RenameModal({
  row,
  onClose,
  onRenamed,
}: {
  row: { id: number; ko: string };
  onClose: () => void;
  onRenamed: (newKo: string) => void;
}) {
  const [newKo, setNewKo] = useState(row.ko);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    affectedCards: number;
    affectedReviews: number;
    isProcedure: boolean;
    conflict: boolean;
    conflictReason: string | null;
  } | null>(null);

  // 입력이 바뀌면 직전 미리보기 무효화 (확정 전 재미리보기 강제)
  useEffect(() => {
    setPreview(null);
  }, [newKo]);

  async function runPreview() {
    const v = newKo.trim();
    if (!v || v === row.ko) {
      showToast("새 태그 이름을 입력해 주세요.", { tone: "danger" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tag-dictionary/${row.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newKo: v, confirm: false }),
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok || !j) {
        showToast((j?.message as string) ?? `미리보기 실패 (HTTP ${r.status})`, { tone: "danger" });
        return;
      }
      setPreview({
        affectedCards: Number(j.affectedCards ?? 0),
        affectedReviews: Number(j.affectedReviews ?? 0),
        isProcedure: Boolean(j.isProcedure),
        conflict: Boolean(j.conflict),
        conflictReason: (j.conflictReason as string) ?? null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const v = newKo.trim();
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tag-dictionary/${row.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newKo: v, confirm: true }),
      });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok || !j) {
        showToast((j?.message as string) ?? `변경 실패 (HTTP ${r.status})`, { tone: "danger" });
        return;
      }
      showToast(`'${row.ko}' → '${v}' 변경됨 (카드 ${Number(j.affectedCards ?? 0)}건 반영)`);
      onRenamed(v);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = !!preview && !preview.conflict;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-left shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-bold text-[var(--text)]">태그 이름 변경</h3>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          현재 <b className="text-[var(--text)]">{row.ko}</b> · 변경 시 카드 글상자 태그(keywords)에
          전파됩니다. 사이트 색상·칩은 다음 배포에 반영됩니다.
        </p>
        <input
          value={newKo}
          onChange={(e) => setNewKo(e.target.value)}
          placeholder="새 태그 이름"
          autoFocus
          className="mb-3 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />

        {preview ? (
          <div className="mb-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-xs">
            {preview.conflict ? (
              <p className="font-medium text-red-600">{preview.conflictReason}</p>
            ) : (
              <ul className="space-y-1 text-[var(--text-secondary)]">
                <li>
                  영향 카드:{" "}
                  <b className="tabular-nums text-[var(--text)]">{preview.affectedCards.toLocaleString()}</b>건
                  (keywords 전파)
                </li>
                {preview.isProcedure ? (
                  <li>
                    시술 후기:{" "}
                    <b className="tabular-nums text-[var(--text)]">{preview.affectedReviews.toLocaleString()}</b>건
                    (시술 분류표 동시 변경 → 자동 전파)
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            취소
          </button>
          {canConfirm ? (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary-active)] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "변경 중" : "확정"}
            </button>
          ) : (
            <button
              type="button"
              onClick={runPreview}
              disabled={busy}
              className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "확인 중" : "미리보기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ row, koSet }: { row: TagRow; koSet: Set<string> }) {
  const [ko, setKo] = useState(row.ko);
  const [category, setCategory] = useState(row.category);
  const [en, setEn] = useState(row.en ?? "");
  const [parent, setParent] = useState(row.parent_ko ?? "");
  const [isProc, setIsProc] = useState(row.is_procedure);
  const [onboarding, setOnboarding] = useState(row.onboarding ?? "");
  const [renameOpen, setRenameOpen] = useState(false);

  const createdLabel = row.first_card_at
    ? formatYmd(row.first_card_at)
    : formatYmd(row.created_at);

  return (
    <tr className="hover:bg-[var(--bg-soft)]">
      {/* 태그(ko) — 클릭 시 rename 모달 */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          className="rounded px-1.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
          title="클릭하여 이름 변경"
        >
          {ko}
        </button>
        {renameOpen ? (
          <RenameModal
            row={{ id: row.id, ko }}
            onClose={() => setRenameOpen(false)}
            onRenamed={(v) => setKo(v)}
          />
        ) : null}
      </td>
      {/* 분류 */}
      <td className="px-2 py-1.5">
        <SelectCell
          value={category}
          options={CATEGORIES}
          onSave={async (v) => {
            const ok = await patchField(row.id, { category: v });
            if (ok) {
              setCategory(v);
              showToast(`'${ko}' 분류 저장됨`);
            }
            return ok;
          }}
        />
      </td>
      {/* 영문 */}
      <td className="px-2 py-1.5">
        <TextCell
          value={en}
          placeholder="—"
          onSave={async (v) => {
            const ok = await patchField(row.id, { en: v });
            if (ok) setEn(v);
            return ok;
          }}
        />
      </td>
      {/* 부모 — 존재 태그만 매칭 (autocomplete) */}
      <td className="px-2 py-1.5">
        <TextCell
          value={parent}
          placeholder="—"
          list="tag-parent-list"
          validate={(v) =>
            v === "" || koSet.has(v) ? null : "존재하는 태그만 부모로 지정할 수 있어요."
          }
          onSave={async (v) => {
            const ok = await patchField(row.id, { parent_ko: v });
            if (ok) setParent(v);
            return ok;
          }}
        />
      </td>
      {/* 시술 후기 (is_procedure) */}
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={isProc}
          onChange={async (e) => {
            const v = e.target.checked;
            const ok = await patchField(row.id, { is_procedure: v });
            if (ok) setIsProc(v);
          }}
        />
      </td>
      {/* 온보딩 */}
      <td className="px-2 py-1.5">
        <SelectCell
          value={onboarding}
          options={ONBOARDING}
          onSave={async (v) => {
            const ok = await patchField(row.id, { onboarding: v });
            if (ok) setOnboarding(v);
            return ok;
          }}
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.usage.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
        {row.search_cnt.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right text-[11px] text-[var(--text-muted)] whitespace-nowrap">
        {createdLabel}
      </td>
    </tr>
  );
}

/** 정렬 헤더 — 클릭 시 URL sort/dir 갱신(replace, history 미적립). */
function SortHeader({
  col,
  label,
  sort,
  dir,
}: {
  col: SortCol;
  label: string;
  sort: SortCol;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = sort === col;
  const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";

  function onClick() {
    const params = new URLSearchParams(sp.toString());
    // 처음 클릭 = 내림차순(큰/최신 순), 재클릭 = 오름차순 토글.
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    params.set("sort", col);
    params.set("dir", nextDir);
    params.delete("page");
    router.replace(`/admin/tags?${params.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center font-medium hover:text-[var(--primary)] " +
        (active ? "text-[var(--primary)]" : "")
      }
    >
      {label}
      <span className="w-3 text-[10px]">{arrow}</span>
    </button>
  );
}

export default function TagAdminTable({
  rows,
  allKo,
  sort,
  dir,
}: {
  rows: TagRow[];
  /** 부모 autocomplete + 검증용 전체 태그 ko 목록 */
  allKo: string[];
  sort: SortCol;
  dir: "asc" | "desc";
}) {
  const koSet = new Set(allKo);
  return (
    <>
      <datalist id="tag-parent-list">
        {allKo.map((p) => (
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
              <th className="px-2 py-2 text-center font-medium">시술 후기</th>
              <th className="px-2 py-2 text-left font-medium">온보딩</th>
              <th className="px-2 py-2 text-right font-medium">
                <SortHeader col="usage" label="사용량" sort={sort} dir={dir} />
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <SortHeader col="search" label="검색량" sort={sort} dir={dir} />
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <SortHeader col="created" label="생성일" sort={sort} dir={dir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <Row key={r.id} row={r} koSet={koSet} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
