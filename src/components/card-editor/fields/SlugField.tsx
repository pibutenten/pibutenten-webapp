"use client";

/**
 * SlugField — 의사 글 URL slug 표시·편집 (admin 전용, 2026-05-30).
 *
 * 노출/편집 정책 (ADR 0012 명함 단위):
 *   - show=false (active 명함이 admin 아님 / 원장 명함) → 아무것도 렌더 안 함.
 *   - show=true & editable=false (검수 발송됨/발행됨 = 잠금) → read-only 표시 + 🔒.
 *   - show=true & editable=true (status=draft, active admin) → 편집 + blur 중복검사 뱃지.
 *
 * 중복·형식 검사는 공용 GET /api/admin/slug-check 사용 (draft 화면과 동일 규칙 — 엇갈림 방지).
 */

import { useState } from "react";
import {
  isValidPostSlug,
  normalizeToSlug,
} from "@/data/procedure-mappings/slug-mapping";

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "taken"; suggestion: string };

export type SlugFieldProps = {
  show: boolean;
  editable: boolean;
  value: string;
  onChange: (v: string) => void;
  doctorId: string | null;
  doctorSlug: string | null;
  postYear: number;
  excludeCardId: number;
};

export default function SlugField({
  show,
  editable,
  value,
  onChange,
  doctorId,
  doctorSlug,
  postYear,
  excludeCardId,
}: SlugFieldProps) {
  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });

  if (!show) return null;

  const baseHint = `/doctors/${doctorSlug ?? "…"}/${postYear}/…`;

  // 잠금 상태 — read-only 표시.
  if (!editable) {
    return (
      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          URL slug{" "}
          <span className="text-[10px] text-[var(--text-muted)]">
            🔒 검수 발송/발행됨 — 잠금 (수정 불가)
          </span>
        </label>
        <input
          type="text"
          value={value}
          readOnly
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/40 px-3 py-2 text-sm text-[var(--text-secondary)]"
        />
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{baseHint}</p>
      </div>
    );
  }

  async function checkSlug() {
    const s = normalizeToSlug(value ?? "");
    if (!isValidPostSlug(s)) {
      setSlugState({ kind: "invalid" });
      return;
    }
    setSlugState({ kind: "checking" });
    try {
      const params = new URLSearchParams({
        year: String(postYear),
        slug: s,
        excludeCardId: String(excludeCardId),
      });
      if (doctorId) params.set("doctorId", doctorId);
      else if (doctorSlug) params.set("doctorSlug", doctorSlug);
      const res = await fetch(`/api/admin/slug-check?${params}`);
      const j = (await res.json()) as {
        available?: boolean;
        reason?: string;
        suggestion?: string | null;
      };
      if (!res.ok) {
        setSlugState({ kind: "idle" });
        return;
      }
      if (j.reason === "invalid_format") setSlugState({ kind: "invalid" });
      else if (j.available) setSlugState({ kind: "ok" });
      else setSlugState({ kind: "taken", suggestion: j.suggestion ?? s });
    } catch {
      setSlugState({ kind: "idle" });
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--text-secondary)]">
        URL slug{" "}
        <span className="text-[10px] text-[var(--text-muted)]">({baseHint})</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSlugState({ kind: "idle" });
          }}
          onBlur={checkSlug}
          placeholder="예: rejuran-skin-booster"
          className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)]"
        />
        <span className="shrink-0 text-[11px] font-medium">
          {slugState.kind === "ok" && (
            <span className="text-green-600">✓ 사용 가능</span>
          )}
          {slugState.kind === "checking" && (
            <span className="text-[var(--text-muted)]">검사 중…</span>
          )}
          {slugState.kind === "invalid" && (
            <span className="text-red-600">형식 오류</span>
          )}
          {slugState.kind === "taken" && (
            <span className="text-red-600">이미 사용 중</span>
          )}
        </span>
      </div>
      {slugState.kind === "taken" && (
        <button
          type="button"
          onClick={() => {
            onChange(slugState.suggestion);
            setSlugState({ kind: "ok" });
          }}
          className="mt-1 text-[11px] text-[var(--primary)] hover:underline"
        >
          제안 적용: {slugState.suggestion}
        </button>
      )}
    </div>
  );
}
