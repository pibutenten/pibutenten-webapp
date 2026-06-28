"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/lib/toast";
import { formatYmd } from "@/lib/format-date";
import { slugifyEn } from "@/lib/tag-slug";

export type TagRow = {
  id: number;
  ko: string;
  category: string;
  en: string | null;
  parent_ko: string | null;
  is_procedure: boolean;
  is_recommendable: boolean;
  reviewed_at: string | null;
  onboarding: string | null;
  created_at: string;
  first_card_at: string | null;
  usage: number;
  search_cnt: number;
};

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정", "필러·볼륨", "주름·윤곽", "레이저", "기타"];
// 온보딩 4종 — 얼굴형·피부타입·피부고민·관심시술 (얼굴형 추가, 2026-06-06).
const ONBOARDING = ["", "얼굴형", "피부타입", "피부고민", "관심시술"];

type SortCol =
  | "usage"
  | "search"
  | "created"
  | "onb_name"
  | "parent_name"
  | "ko_name"
  | "cat_name"
  | "en_name";

type Editable = Pick<
  TagRow,
  "category" | "en" | "parent_ko" | "is_procedure" | "is_recommendable" | "onboarding"
>;

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

/**
 * 태그(ko) rename 입력 모달 (D2).
 * [확인]은 행 draft 에만 반영(즉시 DB 아님) — 다른 셀처럼 행 끝 [저장] 으로 최종 확정.
 * 영향 카드 수는 모달을 열면 바로 표시(사용량 컬럼과 동일 값). 미리보기 API 호출 없음.
 * 사전 내 중복(koSet)은 즉시 차단, 시술 분류표 충돌 등은 저장(rename API)에서 검증.
 */
function RenameModal({
  row,
  usage,
  koSet,
  usageByKo,
  onConfirm,
  onClose,
}: {
  row: { id: number; ko: string };
  usage: number;
  koSet: Set<string>;
  usageByKo: Record<string, number>;
  onConfirm: (newKo: string) => void;
  onClose: () => void;
}) {
  const [newKo, setNewKo] = useState(row.ko);
  const v = newKo.trim();
  const changed = !!v && v !== row.ko;
  // 입력 이름이 기존 태그면 병합(흡수), 아니면 단순 변경. (저장 시 확정 — 즉시 적용 아님)
  const isMerge = changed && koSet.has(v);
  const targetUsage = isMerge ? usageByKo[v] ?? 0 : 0;

  function confirm() {
    if (!v) {
      showToast("새 태그 이름을 입력해 주세요.", { tone: "danger" });
      return;
    }
    if (v === row.ko) {
      onClose();
      return;
    }
    onConfirm(v); // 병합/단순 모두 행 draft 로 보류 → 행 [저장]에서 확정
    onClose();
  }

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
        <p className="mb-3 break-keep text-xs leading-relaxed text-[var(--text-muted)]">
          현재 <b className="text-[var(--text)]">{row.ko}</b> · 이 태그가 달린 카드 약{" "}
          <b className="tabular-nums text-[var(--text)]">{usage.toLocaleString()}</b>건. 입력 후 행{" "}
          <b>[저장]</b> 을 눌러야 확정됩니다.
        </p>
        <input
          value={newKo}
          onChange={(e) => setNewKo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="새 태그 이름"
          autoFocus
          className="mb-2 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        {/* 입력 안내 — 기존 태그면 사용량·병합, 새 이름이면 단순 변경 */}
        {changed &&
          (isMerge ? (
            <div className="mb-3 break-keep rounded-[var(--radius-sm)] bg-amber-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-800">
              <p>
                기존 <b>{v}</b> 태그(사용량{" "}
                <b className="tabular-nums">{targetUsage.toLocaleString()}</b>개)가 있어요 — [저장] 시{" "}
                <b>{row.ko}</b> 가 <b>{v}</b> 로 <b>병합(흡수)</b>됩니다. (카드 약{" "}
                <b className="tabular-nums">{usage.toLocaleString()}</b>건 이관 · {row.ko} 삭제 · 병합은 되돌릴 수 없음)
              </p>
              <p className="mt-1.5">
                병합 후 <b>생성일·사용량·영문</b>은 기존 <b>{v}</b> 기준입니다. (단, 대상 태그 영문이
                비어 있으면 <b>{row.ko}</b> 의 영문을 승계)
              </p>
            </div>
          ) : (
            <p className="mb-3 break-keep rounded-[var(--radius-sm)] bg-[var(--bg-soft)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
              새 이름 <b className="text-[var(--text)]">{v}</b> 으로 변경됩니다 — [저장] 시 적용, 저장 직후 취소 가능.
            </p>
          ))}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  allKo,
  koSet,
  usageByKo,
  status,
}: {
  row: TagRow;
  allKo: string[];
  koSet: Set<string>;
  usageByKo: Record<string, number>;
  status: string;
}) {
  void status; // 컬럼은 모든 상태 동일(검토 탭은 page.tsx 필터 차이뿐)
  // ko 도 draft — rename 은 모달 [확인]으로 draft 반영, 행 [저장] 시 rename API 로 확정.
  const [savedKo, setSavedKo] = useState(row.ko);
  const [ko, setKo] = useState(row.ko);
  const base: Editable = {
    category: row.category,
    en: row.en,
    parent_ko: row.parent_ko,
    is_procedure: row.is_procedure,
    is_recommendable: row.is_recommendable,
    onboarding: row.onboarding,
  };
  const [saved, setSaved] = useState<Editable>(base);
  const [draft, setDraft] = useState<Editable>(base);
  const [editing, setEditing] = useState<null | "category" | "en" | "parent" | "onboarding">(null);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [reviewedAt, setReviewedAt] = useState<string | null>(row.reviewed_at);
  // 저장 직후 '취소' 가능 스냅샷 — 이 화면 머무는 동안만(클라). null=저장 상태, 값=취소 가능.
  const [cancelSnap, setCancelSnap] = useState<
    { ko: string; fields: Editable; reviewedAt: string | null } | null
  >(null);
  const router = useRouter();

  const koDirty = ko !== savedKo;
  const fieldsDirty =
    draft.category !== saved.category ||
    (draft.en ?? "") !== (saved.en ?? "") ||
    (draft.parent_ko ?? "") !== (saved.parent_ko ?? "") ||
    draft.is_procedure !== saved.is_procedure ||
    draft.is_recommendable !== saved.is_recommendable ||
    (draft.onboarding ?? "") !== (saved.onboarding ?? "");
  const dirty = koDirty || fieldsDirty;

  // 저장 = 편집 확정 + 검수완료(reviewed_at=now). 모든 탭/상태 동일. 편집 없어도 누르면 검수완료(잔류).
  async function save() {
    if (busy) return;
    const p = (draft.parent_ko ?? "").trim();
    if (p && !koSet.has(p)) {
      showToast("존재하는 태그만 부모로 지정할 수 있어요.", { tone: "danger" });
      return;
    }
    setBusy(true);
    try {
      const snap = { ko: savedKo, fields: { ...saved }, reviewedAt };
      if (koDirty) {
        // 입력 이름이 기존 태그면 병합(흡수) — 행 삭제·되돌릴 수 없음(취소 없음, refresh).
        if (koSet.has(ko)) {
          const r = await fetch(`/api/admin/tag-dictionary/${row.id}/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetKo: ko, confirm: true }),
          });
          const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
          if (!r.ok) {
            showToast((j?.message as string) ?? `병합 실패 (HTTP ${r.status})`, { tone: "danger" });
            return;
          }
          showToast(`'${savedKo}' → '${ko}' 병합됨 (카드 ${Number(j?.affectedCards ?? 0)}건 이관)`);
          router.refresh();
          return;
        }
        // 단순 이름 변경 — rename API.
        const r = await fetch(`/api/admin/tag-dictionary/${row.id}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newKo: ko, confirm: true }),
        });
        const j = (await r.json().catch(() => null)) as { message?: string } | null;
        if (!r.ok) {
          showToast(j?.message ?? `이름 변경 실패 (HTTP ${r.status})`, { tone: "danger" });
          return;
        }
        setSavedKo(ko);
      }
      const body: Record<string, unknown> = { reviewed: true };
      if (draft.category !== saved.category) body.category = draft.category;
      if ((draft.en ?? "") !== (saved.en ?? "")) body.en = slugifyEn(draft.en ?? "");
      if ((draft.parent_ko ?? "") !== (saved.parent_ko ?? "")) body.parent_ko = p;
      if (draft.is_procedure !== saved.is_procedure) body.is_procedure = draft.is_procedure;
      if (draft.is_recommendable !== saved.is_recommendable) body.is_recommendable = draft.is_recommendable;
      if ((draft.onboarding ?? "") !== (saved.onboarding ?? "")) body.onboarding = draft.onboarding ?? "";
      const ok = await patchFields(row.id, body);
      if (!ok) return;
      const normalizedEn = body.en !== undefined ? (body.en as string) : (draft.en ?? "");
      const newSaved: Editable = {
        ...draft,
        en: normalizedEn,
        parent_ko: body.parent_ko !== undefined ? (body.parent_ko as string) : draft.parent_ko,
      };
      setSaved(newSaved);
      setDraft((d) => ({ ...d, en: normalizedEn, parent_ko: (d.parent_ko ?? "").trim() }));
      setReviewedAt(new Date().toISOString());
      setCancelSnap(snap); // 버튼 → '취소'
      showToast(`'${ko}' 검수완료`);
    } finally {
      setBusy(false);
    }
  }

  // 취소 = 방금 저장 통째 복원(편집 항목 전부 + reviewed_at). 저장 직전 스냅샷으로.
  async function cancel() {
    if (busy || !cancelSnap) return;
    const snap = cancelSnap;
    setBusy(true);
    try {
      if (savedKo !== snap.ko) {
        const r = await fetch(`/api/admin/tag-dictionary/${row.id}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newKo: snap.ko, confirm: true }),
        });
        const j = (await r.json().catch(() => null)) as { message?: string } | null;
        if (!r.ok) {
          showToast(j?.message ?? `취소 실패 (HTTP ${r.status})`, { tone: "danger" });
          return;
        }
        setKo(snap.ko);
        setSavedKo(snap.ko);
      }
      const ok = await patchFields(row.id, {
        category: snap.fields.category,
        en: snap.fields.en,
        parent_ko: snap.fields.parent_ko,
        is_procedure: snap.fields.is_procedure,
        is_recommendable: snap.fields.is_recommendable,
        onboarding: snap.fields.onboarding ?? "",
        reviewed_at: snap.reviewedAt,
      });
      if (!ok) return;
      setSaved(snap.fields);
      setDraft(snap.fields);
      setReviewedAt(snap.reviewedAt);
      setCancelSnap(null);
      showToast(`'${snap.ko}' 저장 취소됨`);
    } finally {
      setBusy(false);
    }
  }

  const createdLabel = row.first_card_at ? formatYmd(row.first_card_at) : formatYmd(row.created_at);

  return (
    <tr
      className={
        dirty
          ? "bg-amber-50/70"
          : cancelSnap
            ? "bg-emerald-50/50"
            : "hover:bg-[var(--bg-soft)]"
      }
    >
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
            usage={row.usage}
            koSet={koSet}
            usageByKo={usageByKo}
            onConfirm={(v) => setKo(v)}
            onClose={() => setRenameOpen(false)}
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
      {/* 시술 후기 (is_procedure) — draft 편집, [저장]으로 확정 */}
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
      {/* 추천 (is_recommendable) — 전 상태 상시 표시. draft 편집, [저장]으로 확정. */}
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.is_recommendable}
          onChange={(e) => setDraft({ ...draft, is_recommendable: e.target.checked })}
          title="추천(자동태깅 후보)"
        />
      </td>
      {/* 관리 — 저장(=검수완료) ↔ 취소 토글. 취소는 이 화면 머무는 동안만(새로고침 시 확정).
          단, '취소' 상태에서 추가 편집(dirty)이 생기면 다시 '저장'으로 전환(발주 M). */}
      <td className="px-2 py-1.5 text-center">
        {cancelSnap && !dirty ? (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            title="방금 저장(편집+검수완료) 되돌리기 — 새로고침 전까지만 가능"
            className="rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] disabled:opacity-50"
          >
            {busy ? "취소중" : "취소"}
          </button>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            title="편집 확정 + 검수완료(reviewed_at)"
            className={
              "rounded px-2 py-1 text-[11px] font-medium text-white transition-colors disabled:opacity-50 " +
              (dirty
                ? "bg-[var(--primary)] hover:bg-[var(--primary-active)]"
                : "bg-[var(--primary-light)] hover:bg-[var(--primary)]")
            }
          >
            {busy ? "저장중" : "저장"}
          </button>
        )}
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
  usageByKo,
  sort,
  dir,
  status,
}: {
  rows: TagRow[];
  allKo: string[];
  /** 전체 태그 ko → 사용량(이름 변경 모달 병합 안내용) */
  usageByKo: Record<string, number>;
  sort: SortCol;
  dir: "asc" | "desc";
  /** 현재 상태 필터(필터 헤더 활성 표시용) */
  status: string;
}) {
  const koSet = new Set(allKo);
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      {/* 11컬럼(전 상태 동일): 태그·분류·영문·부모·시술후기·온보딩·사용량·검색량·생성일·추천·관리. */}
      <table className="w-full min-w-[1008px] table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: "126px" }} />
          <col style={{ width: "94px" }} />
          <col style={{ width: "112px" }} />
          <col style={{ width: "84px" }} />{/* 부모 */}
          <col style={{ width: "84px" }} />{/* 시술 후기 */}
          <col style={{ width: "92px" }} />{/* 온보딩 */}
          <col style={{ width: "72px" }} />{/* 사용량 */}
          <col style={{ width: "72px" }} />{/* 검색량 */}
          <col style={{ width: "84px" }} />{/* 생성일 */}
          <col style={{ width: "56px" }} />{/* 추천 */}
          <col style={{ width: "72px" }} />{/* 관리(저장↔취소) */}
        </colgroup>
        <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
          <tr>
            {/* G1: 태그·분류·영문·부모 = 정렬(가나다/알파벳). 온보딩·시술 후기 = 필터 유지. */}
            <th className="px-2 py-2 text-left font-medium">
              <SortHeader col="ko_name" label="태그" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-left font-medium">
              <SortHeader col="cat_name" label="분류" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-left font-medium">
              <SortHeader col="en_name" label="영문" sort={sort} dir={dir} />
            </th>
            <th className="px-2 py-2 text-left font-medium">
              <SortHeader col="parent_name" label="부모" sort={sort} dir={dir} />
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-center font-medium">
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
            <th className="whitespace-nowrap px-2 py-2 text-center font-medium">추천</th>
            <th className="px-2 py-2 text-center font-medium">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <Row key={r.id} row={r} allKo={allKo} koSet={koSet} usageByKo={usageByKo} status={status} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
