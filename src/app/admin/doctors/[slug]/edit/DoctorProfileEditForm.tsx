"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pickErrorMessage } from "@/lib/api-error";
import type { DoctorProfileData } from "@/lib/doctor-profile";

type Props = {
  slug: string;
  initial: DoctorProfileData;
};

type FormState = {
  education: string[];
  career: string[];
  expertise: string[];
  memberOf: string[];
  publications: string[];
  youtube: string;
  instagram: string;
  blog: string;
  threads: string;
  clinicUrl: string;
  addressRegion: string;
  addressLocality: string;
};

const ARRAY_FIELDS = [
  "education",
  "career",
  "expertise",
  "memberOf",
  "publications",
] as const;

const STRING_FIELDS = [
  "youtube",
  "instagram",
  "blog",
  "threads",
  "clinicUrl",
  "addressRegion",
  "addressLocality",
] as const;

type ArrayField = (typeof ARRAY_FIELDS)[number];
type StringField = (typeof STRING_FIELDS)[number];

const ARRAY_LABELS: Record<ArrayField, { label: string; helper: string; placeholder: string; multiline?: boolean }> = {
  education: {
    label: "학력",
    helper: "예: 서울대학교 의과대학 졸업 (2010)",
    placeholder: "○○대학교 의과대학 졸업 (연도)",
  },
  career: {
    label: "경력",
    helper: "예: 힐하우스피부과 강남점 원장 / 삼성서울병원 피부과 전공의",
    placeholder: "근무처·직책 (기간)",
  },
  expertise: {
    label: "전문 분야",
    helper: "예: 안티에이징, 리프팅, 백반증",
    placeholder: "한 줄에 한 분야",
  },
  memberOf: {
    label: "학회 · 소속",
    helper: "예: 대한피부과학회 정회원",
    placeholder: "학회·협회명",
  },
  publications: {
    label: "출판 · 저서",
    helper: "예: 『피부과학 임상 가이드』 공저 (2022)",
    placeholder: "저서·논문 제목",
    multiline: true,
  },
};

const STRING_LABELS: Record<StringField, { label: string; helper: string; placeholder: string; type?: string }> = {
  youtube: {
    label: "유튜브",
    helper: "예: https://youtube.com/@channel",
    placeholder: "https://youtube.com/...",
    type: "url",
  },
  instagram: {
    label: "인스타그램",
    helper: "예: https://instagram.com/handle",
    placeholder: "https://instagram.com/...",
    type: "url",
  },
  blog: {
    label: "블로그",
    helper: "예: https://blog.naver.com/...",
    placeholder: "https://...",
    type: "url",
  },
  threads: {
    label: "스레드",
    helper: "예: https://www.threads.com/@handle",
    placeholder: "https://www.threads.com/...",
    type: "url",
  },
  clinicUrl: {
    label: "병원 홈페이지",
    helper: "병원 공식 홈페이지 URL",
    placeholder: "https://...",
    type: "url",
  },
  addressRegion: {
    label: "주소 — 시 / 도",
    helper: "예: 서울특별시 / 경기도",
    placeholder: "시·도",
  },
  addressLocality: {
    label: "주소 — 구 / 시",
    helper: "예: 강남구 / 성남시 분당구",
    placeholder: "구·시",
  },
};

function toFormState(d: DoctorProfileData): FormState {
  return {
    education: d.education?.length ? [...d.education] : [""],
    career: d.career?.length ? [...d.career] : [""],
    expertise: d.expertise?.length ? [...d.expertise] : [""],
    memberOf: d.memberOf?.length ? [...d.memberOf] : [""],
    publications: d.publications?.length ? [...d.publications] : [""],
    youtube: d.youtube ?? "",
    instagram: d.instagram ?? "",
    blog: d.blog ?? "",
    threads: d.threads ?? "",
    clinicUrl: d.clinicUrl ?? "",
    addressRegion: d.addressRegion ?? "",
    addressLocality: d.addressLocality ?? "",
  };
}

/**
 * FormState → 저장용 DoctorProfileData (빈 string·빈 배열 제거).
 */
function cleanState(s: FormState): DoctorProfileData {
  const out: DoctorProfileData = {};
  for (const k of ARRAY_FIELDS) {
    const cleaned = s[k]
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (cleaned.length > 0) out[k] = cleaned;
  }
  for (const k of STRING_FIELDS) {
    const v = s[k].trim();
    if (v.length > 0) out[k] = v;
  }
  return out;
}

function statesEqual(a: FormState, b: FormState): boolean {
  for (const k of ARRAY_FIELDS) {
    if (a[k].length !== b[k].length) return false;
    for (let i = 0; i < a[k].length; i++) {
      if (a[k][i] !== b[k][i]) return false;
    }
  }
  for (const k of STRING_FIELDS) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export default function DoctorProfileEditForm({ slug, initial }: Props) {
  const router = useRouter();
  const initialState = useMemo(() => toFormState(initial), [initial]);
  const [state, setState] = useState<FormState>(initialState);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const dirty = !statesEqual(state, initialState);

  function updateArrayItem(field: ArrayField, idx: number, value: string) {
    setState((s) => {
      const next = [...s[field]];
      next[idx] = value;
      return { ...s, [field]: next };
    });
  }

  function addArrayItem(field: ArrayField) {
    setState((s) => ({ ...s, [field]: [...s[field], ""] }));
  }

  function removeArrayItem(field: ArrayField, idx: number) {
    setState((s) => {
      const next = s[field].filter((_, i) => i !== idx);
      return { ...s, [field]: next.length === 0 ? [""] : next };
    });
  }

  function updateString(field: StringField, value: string) {
    setState((s) => ({ ...s, [field]: value }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        const cleaned = cleanState(state);
        // 2026-05-29: 옛 `supabase.from("doctors").update()` 직접 호출은 `doctors`
        // 테이블의 UPDATE RLS 정책 0개 + GRANT 0개로 "permission denied" 항상 실패.
        // 신규 PUT 라우트로 통일 — 가드(super admin 또는 본인 의사) + audit_logs.
        const res = await fetch(
          `/api/admin/doctors/${encodeURIComponent(slug)}/profile`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleaned),
          },
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          setMsg({ type: "err", text: pickErrorMessage(j, res.status) });
          return;
        }
        setMsg({ type: "ok", text: "저장되었습니다." });
        router.refresh();
      } catch (e) {
        setMsg({
          type: "err",
          text: e instanceof Error ? e.message : "저장 실패",
        });
      }
    });
  }

  function cancel() {
    if (dirty) {
      const ok = window.confirm(
        "변경사항이 저장되지 않았습니다. 정말 취소하시겠어요?",
      );
      if (!ok) return;
    }
    router.push("/admin/doctors");
  }

  return (
    <div className="space-y-5">
      {ARRAY_FIELDS.map((field) => {
        const meta = ARRAY_LABELS[field];
        return (
          <div
            key={field}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--text)]">
                {meta.label}
              </h2>
              <span className="text-[11px] text-[var(--text-muted)]">
                {meta.helper}
              </span>
            </div>
            <div className="space-y-2">
              {state[field].map((value, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  {meta.multiline ? (
                    <textarea
                      value={value}
                      onChange={(e) =>
                        updateArrayItem(field, idx, e.target.value)
                      }
                      placeholder={meta.placeholder}
                      rows={2}
                      disabled={pending}
                      className="min-h-[36px] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        updateArrayItem(field, idx, e.target.value)
                      }
                      placeholder={meta.placeholder}
                      disabled={pending}
                      className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeArrayItem(field, idx)}
                    disabled={pending}
                    aria-label="삭제"
                    title="삭제"
                    className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-muted)] hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addArrayItem(field)}
              disabled={pending}
              className="mt-3 inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed"
            >
              + 항목 추가
            </button>
          </div>
        );
      })}

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-[var(--text)]">
          외부 채널 · 의원 · 주소
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STRING_FIELDS.map((field) => {
            const meta = STRING_LABELS[field];
            return (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  {meta.label}
                </label>
                <input
                  type={meta.type ?? "text"}
                  value={state[field]}
                  onChange={(e) => updateString(field, e.target.value)}
                  placeholder={meta.placeholder}
                  disabled={pending}
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {meta.helper}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-soft)] p-3">
        {msg && (
          <span
            className={
              "mr-auto text-xs " +
              (msg.type === "ok" ? "text-emerald-700" : "text-red-600")
            }
          >
            {msg.text}
          </span>
        )}
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-4 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--primary)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--border)] disabled:text-white"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
