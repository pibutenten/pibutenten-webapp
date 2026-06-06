"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type SortCol = "usage" | "search" | "created" | "onb_name" | "parent_name" | "ko_name";

type Editable = Pick<TagRow, "category" | "en" | "parent_ko" | "is_procedure" | "onboarding">;

/** 변경 필드만 묶어 PATCH. 성공 true. */
async function patchFields(id: number, body: Record<string, unknown>): Promise<boolean> {
  if (Object.keys(body).length === 0) return true;
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

// 읽기↔편집 폭 불변(table-layout:fixed) — 셀 위젯·표시 모두 w-full.
const editBox =
  "w-full rounded border border-[var(--border)] bg-white px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none";
const readBox =
  "block w-full cursor-pointer truncate rounded px-1.5 py-1 text-xs hover:bg-[var(--bg-soft)]";

/** 부모 autocomplete — 타이핑 필터 + 드롭다운(최대 높이·스크롤). 통짜 노출 방지. */
function ParentCombo({
  value,
  allKo,
  onChange,
  onClose,
}: {
  value: string;
  allKo: string[];
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 160) });
  }, []);

  const norm = q.trim();
  const matches = (norm ? allKo.filter((k) => k.includes(norm)) : allKo).slice(0, 100);

  function pick(k: string) {
    setQ(k);
    onChange(k);
    onClose();
  }

  return (
    <>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="부모 태그"
        className={editBox}
      />
      {rect && matches.length > 0
        ? createPortal(
            <ul
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                maxHeight: "11rem", // 약 7개 + 스크롤
                overflowY: "auto",
                zIndex: 60,
              }}
              className="rounded-md border border-[var(--border)] bg-white py-1 text-xs shadow-lg"
            >
              {matches.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    // blur 보다 먼저 선택되도록 mousedown + preventDefault
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(k);
                    }}
                    className="block w-full truncate px-2 py-1 text-left hover:bg-[var(--bg-soft)]"
                  >
                    {k}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}

/** 태그(ko) rename — 미리보기 게이트 모달. */
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
        className="w-full max-w-lg rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-left shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-bold text-[var(--text)]">태그 이름 변경</h3>
        {/* 줄바꿈 보장 — 긴 안내문이 잘리지 않게 break-keep + leading 여유 */}
        <p className="mb-3 break-keep text-xs leading-relaxed text-[var(--text-muted)]">
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
              <p className="break-keep font-medium text-red-600">{preview.conflictReason}</p>
            ) : (
              <ul className="space-y-1 break-keep text-[var(--text-secondary)]">
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

function Row({ row, allKo, koSet }: { row: TagRow; allKo: string[]; koSet: Set<string> }) {
  const [ko, setKo] = useState(row.ko);
  const base: Editable = {
    category: row.category,
    en: row.en,
    parent_ko: row.parent_ko,
    is_procedure: row.is_procedure,
    onboarding: row.onboarding,
  };
  const [saved, setSaved] = useState<Editable>(base);
  const [draft, setDraft] = useState<Editable>(base);
  const [editing, setEditing] = useState<null | "category" | "en" | "parent" | "onboarding">(null);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const dirty =
    draft.category !== saved.category ||
    (draft.en ?? "") !== (saved.en ?? "") ||
    (draft.parent_ko ?? "") !== (saved.parent_ko ?? "") ||
    draft.is_procedure !== saved.is_procedure ||
    (draft.onboarding ?? "") !== (saved.onboarding ?? "");

  async function save() {
    if (!dirty || busy) return;
    // 부모 존재 검증 (입력했는데 사전에 없는 태그면 거부)
    const p = (draft.parent_ko ?? "").trim();
    if (p && !koSet.has(p)) {
      showToast("존재하는 태그만 부모로 지정할 수 있어요.", { tone: "danger" });
      return;
    }
    const body: Record<string, unknown> = {};
    if (draft.category !== saved.category) body.category = draft.category;
    if ((draft.en ?? "") !== (saved.en ?? "")) body.en = (draft.en ?? "").trim();
    if ((draft.parent_ko ?? "") !== (saved.parent_ko ?? "")) body.parent_ko = p;
    if (draft.is_procedure !== saved.is_procedure) body.is_procedure = draft.is_procedure;
    if ((draft.onboarding ?? "") !== (saved.onboarding ?? "")) body.onboarding = draft.onboarding ?? "";

    setBusy(true);
    const ok = await patchFields(row.id, body);
    setBusy(false);
    if (ok) {
      setSaved({ ...draft, en: body.en !== undefined ? (body.en as string) : draft.en, parent_ko: body.parent_ko !== undefined ? (body.parent_ko as string) : draft.parent_ko });
      setDraft((d) => ({ ...d, en: (d.en ?? "").trim(), parent_ko: (d.parent_ko ?? "").trim() }));
      showToast(`'${ko}' 저장됨`);
    }
  }

  const createdLabel = row.first_card_at ? formatYmd(row.first_card_at) : formatYmd(row.created_at);

  return (
    <tr className={dirty ? "bg-amber-50/70" : "hover:bg-[var(--bg-soft)]"}>
      {/* 태그(ko) — 클릭 시 rename 모달 */}
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          className="block w-full truncate rounded px-1.5 py-1 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
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
        {editing === "category" ? (
          <select
            autoFocus
            value={draft.category}
            onChange={(e) => {
              setDraft({ ...draft, category: e.target.value });
              setEditing(null);
            }}
            onBlur={() => setEditing(null)}
            className={editBox}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <span role="button" tabIndex={0} onClick={() => setEditing("category")} className={readBox}>
            {draft.category}
          </span>
        )}
      </td>
      {/* 영문 */}
      <td className="px-2 py-1.5">
        {editing === "en" ? (
          <input
            autoFocus
            value={draft.en ?? ""}
            onChange={(e) => setDraft({ ...draft, en: e.target.value })}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                setEditing(null);
              }
            }}
            placeholder="영문"
            className={editBox}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setEditing("en")}
            className={readBox + ((draft.en ?? "") ? "" : " text-[var(--text-muted)]")}
          >
            {(draft.en ?? "") || "—"}
          </span>
        )}
      </td>
      {/* 부모 — autocomplete */}
      <td className="px-2 py-1.5">
        {editing === "parent" ? (
          <ParentCombo
            value={draft.parent_ko ?? ""}
            allKo={allKo}
            onChange={(v) => setDraft({ ...draft, parent_ko: v })}
            onClose={() => setEditing(null)}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setEditing("parent")}
            className={readBox + ((draft.parent_ko ?? "") ? "" : " text-[var(--text-muted)]")}
          >
            {(draft.parent_ko ?? "") || "—"}
          </span>
        )}
      </td>
      {/* 시술 후기 (is_procedure) */}
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.is_procedure}
          onChange={(e) => setDraft({ ...draft, is_procedure: e.target.checked })}
        />
      </td>
      {/* 온보딩 */}
      <td className="px-2 py-1.5">
        {editing === "onboarding" ? (
          <select
            autoFocus
            value={draft.onboarding ?? ""}
            onChange={(e) => {
              setDraft({ ...draft, onboarding: e.target.value });
              setEditing(null);
            }}
            onBlur={() => setEditing(null)}
            className={editBox}
          >
            {ONBOARDING.map((o) => (
              <option key={o} value={o}>{o || "—"}</option>
            ))}
          </select>
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => setEditing("onboarding")}
            className={readBox + ((draft.onboarding ?? "") ? "" : " text-[var(--text-muted)]")}
          >
            {(draft.onboarding ?? "") || "—"}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.usage.toLocaleString()}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
        {row.search_cnt.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right text-[11px] text-[var(--text-muted)] whitespace-nowrap">
        {createdLabel}
      </td>
      {/* 관리 — 행 단위 저장 */}
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

/** 정렬 헤더(숫자 컬럼) — 클릭 내림차순, 재클릭 오름차순(replace). */
function SortHeader({ col, label, sort, dir }: { col: SortCol; label: string; sort: SortCol; dir: "asc" | "desc" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = sort === col;
  const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";
  function onClick() {
    const p = new URLSearchParams(sp.toString());
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    p.set("sort", col);
    p.set("dir", nextDir);
    p.delete("page");
    router.replace(`/admin/tags?${p.toString()}`, { scroll: false });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={"inline-flex items-center font-medium hover:text-[var(--primary)] " + (active ? "text-[var(--primary)]" : "")}
    >
      {label}
      <span className="w-3 text-[10px]">{arrow}</span>
    </button>
  );
}

/** 필터 헤더(온보딩·부모·시술후기) — 클릭 시 값 있는 행만 필터 + 가나다순(replace). */
function FilterHeader({
  label,
  status,
  sortCol,
  curStatus,
}: {
  label: string;
  status: "onb" | "parent" | "proc";
  sortCol: SortCol;
  curStatus: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = curStatus === status;
  function onClick() {
    const p = new URLSearchParams(sp.toString());
    if (active) {
      // 토글 해제
      p.delete("status");
      p.delete("sort");
      p.delete("dir");
    } else {
      p.set("status", status);
      p.set("sort", sortCol);
      p.set("dir", "asc");
    }
    p.delete("page");
    router.replace(`/admin/tags?${p.toString()}`, { scroll: false });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="클릭: 값 있는 행만 가나다순"
      className={"inline-flex items-center font-medium hover:text-[var(--primary)] " + (active ? "text-[var(--primary)]" : "")}
    >
      {label}
      <span className="w-3 text-[10px]">{active ? " ▾" : ""}</span>
    </button>
  );
}

export default function TagAdminTable({
  rows,
  allKo,
  sort,
  dir,
  status,
}: {
  rows: TagRow[];
  allKo: string[];
  sort: SortCol;
  dir: "asc" | "desc";
  /** 현재 상태 필터(필터 헤더 활성 표시용) */
  status: string;
}) {
  const koSet = new Set(allKo);
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-full min-w-[1020px] table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: "140px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "130px" }} />
          <col style={{ width: "120px" }} />
          <col style={{ width: "84px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "82px" }} />
          <col style={{ width: "82px" }} />
          <col style={{ width: "92px" }} />
          <col style={{ width: "70px" }} />
        </colgroup>
        <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
          <tr>
            <th className="px-2 py-2 text-left font-medium">태그</th>
            <th className="px-2 py-2 text-left font-medium">분류</th>
            <th className="px-2 py-2 text-left font-medium">영문</th>
            <th className="px-2 py-2 text-left font-medium">
              <FilterHeader label="부모" status="parent" sortCol="parent_name" curStatus={status} />
            </th>
            <th className="px-2 py-2 text-center font-medium">
              <FilterHeader label="시술 후기" status="proc" sortCol="ko_name" curStatus={status} />
            </th>
            <th className="px-2 py-2 text-left font-medium">
              <FilterHeader label="온보딩" status="onb" sortCol="onb_name" curStatus={status} />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <SortHeader col="usage" label="사용량" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <SortHeader col="search" label="검색량" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-right font-medium">
              <SortHeader col="created" label="생성일" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-center font-medium">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <Row key={r.id} row={r} allKo={allKo} koSet={koSet} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
