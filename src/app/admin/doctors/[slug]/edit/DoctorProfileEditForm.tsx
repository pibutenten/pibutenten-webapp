"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pickErrorMessage } from "@/lib/api-error";
import {
  getDoctorPapers,
  type DoctorPaper,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import { CLINIC_BRANCHES } from "@/lib/clinic-branches";

/** 원장 운영 설정 초기값 (0341: clinic_id·is_affiliated·is_listed). */
export type DoctorSettings = {
  clinicId: number | null;
  isAffiliated: boolean;
  isListed: boolean;
};

type Props = {
  slug: string;
  initial: DoctorProfileData;
  /** super admin 에게만 '운영 설정' 섹션 노출. */
  isSuperAdmin: boolean;
  /** 운영 설정 초기값. */
  settings: DoctorSettings;
};

/** 논문 편집 행 — year 는 폼에선 문자열(입력), 저장 시 number 변환. */
type PaperRow = { pmid: string; title: string; journal: string; year: string };

type FormState = {
  education: string[];
  career: string[];
  expertise: string[];
  memberOf: string[];
  societyRoles: string[];
  publications: string[];
  papers: PaperRow[];
  orcid: string;
  googleScholarUrl: string;
  youtube: string;
  instagram: string;
  blog: string;
  threads: string;
  clinicUrl: string;
  addressRegion: string;
  addressLocality: string;
  /** 전문의 취득연도 — 폼에선 문자열, 저장 시 number 변환 */
  boardCertifiedYear: string;
};

const ARRAY_FIELDS = [
  "education",
  "career",
  "expertise",
  "memberOf",
  "societyRoles",
  "publications",
] as const;

const STRING_FIELDS = [
  "orcid",
  "googleScholarUrl",
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
  societyRoles: {
    label: "학회 임원직",
    helper: "예: 대한피부과의사회 홍보간사 (학회명 + 직책)",
    placeholder: "학회명 + 직책",
  },
  publications: {
    label: "출판 · 저서",
    helper: "예: 『피부과학 임상 가이드』 공저 (2022)",
    placeholder: "저서·논문 제목",
    multiline: true,
  },
};

const STRING_LABELS: Record<StringField, { label: string; helper: string; placeholder: string; type?: string }> = {
  orcid: {
    label: "ORCID iD",
    helper: "예: 0000-0002-0968-9647 (숫자·하이픈 16자리)",
    placeholder: "0000-0000-0000-0000",
  },
  googleScholarUrl: {
    label: "Google Scholar",
    helper: "Google Scholar 프로필 URL",
    placeholder: "https://scholar.google.com/citations?user=...",
    type: "url",
  },
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
    societyRoles: d.societyRoles?.length ? [...d.societyRoles] : [""],
    publications: d.publications?.length ? [...d.publications] : [""],
    papers: (() => {
      const ps = getDoctorPapers(d);
      return ps.length
        ? ps.map((p) => ({
            pmid: p.pmid,
            title: p.title,
            journal: p.journal ?? "",
            year: p.year ? String(p.year) : "",
          }))
        : [{ pmid: "", title: "", journal: "", year: "" }];
    })(),
    orcid: d.orcid ?? "",
    googleScholarUrl: d.googleScholarUrl ?? "",
    youtube: d.youtube ?? "",
    instagram: d.instagram ?? "",
    blog: d.blog ?? "",
    threads: d.threads ?? "",
    clinicUrl: d.clinicUrl ?? "",
    addressRegion: d.addressRegion ?? "",
    addressLocality: d.addressLocality ?? "",
    boardCertifiedYear: d.boardCertifiedYear ? String(d.boardCertifiedYear) : "",
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
  // 전문의 취득연도 — number 변환 (1900~2100 유효 범위만).
  const year = parseInt(s.boardCertifiedYear.trim(), 10);
  if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
    out.boardCertifiedYear = year;
  }
  // 대표 논문 — pmid(숫자 1~12자)+title 필수 행만. journal·year 선택. 같은 pmid 중복 제거
  //   (React key·JSON-LD @id 충돌 방지 — 첫 행 우선).
  const papers: DoctorPaper[] = [];
  const seenPmids = new Set<string>();
  for (const r of s.papers) {
    const pmid = r.pmid.trim();
    const title = r.title.trim();
    if (!/^\d{1,12}$/.test(pmid) || title.length === 0) continue;
    if (seenPmids.has(pmid)) continue;
    seenPmids.add(pmid);
    const paper: DoctorPaper = { pmid, title };
    const journal = r.journal.trim();
    if (journal) paper.journal = journal;
    const py = parseInt(r.year.trim(), 10);
    if (Number.isFinite(py) && py >= 1900 && py <= 2100) paper.year = py;
    papers.push(paper);
  }
  if (papers.length > 0) out.papers = papers;
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
  if (a.boardCertifiedYear !== b.boardCertifiedYear) return false;
  if (a.papers.length !== b.papers.length) return false;
  for (let i = 0; i < a.papers.length; i++) {
    const pa = a.papers[i];
    const pb = b.papers[i];
    if (
      pa.pmid !== pb.pmid ||
      pa.title !== pb.title ||
      pa.journal !== pb.journal ||
      pa.year !== pb.year
    ) {
      return false;
    }
  }
  return true;
}

export default function DoctorProfileEditForm({
  slug,
  initial,
  isSuperAdmin,
  settings,
}: Props) {
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

  function updatePaper(idx: number, key: keyof PaperRow, value: string) {
    setState((s) => {
      const next = s.papers.map((p, i) =>
        i === idx ? { ...p, [key]: value } : p,
      );
      return { ...s, papers: next };
    });
  }

  function addPaper() {
    setState((s) => ({
      ...s,
      papers: [...s.papers, { pmid: "", title: "", journal: "", year: "" }],
    }));
  }

  function removePaper(idx: number) {
    setState((s) => {
      const next = s.papers.filter((_, i) => i !== idx);
      return {
        ...s,
        papers: next.length === 0 ? [{ pmid: "", title: "", journal: "", year: "" }] : next,
      };
    });
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
      {isSuperAdmin && (
        <DoctorSettingsSection slug={slug} initial={settings} />
      )}

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

      {/* 대표 논문 — PMID·제목 필수, 저널·연도 선택. 프로필 "대표 논문" 표시 + ScholarlyArticle JSON-LD. */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text)]">대표 논문</h2>
          <span className="text-[11px] text-[var(--text-muted)]">
            PMID·제목 필수 · 저널·연도 선택 (PubMed 기준). 원장 프로필에 표시됩니다.
          </span>
        </div>
        <div className="space-y-3">
          {state.papers.map((row, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-soft)] p-3"
            >
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.pmid}
                    onChange={(e) => updatePaper(idx, "pmid", e.target.value)}
                    placeholder="PMID"
                    disabled={pending}
                    className="h-9 w-[120px] shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updatePaper(idx, "title", e.target.value)}
                    placeholder="논문 제목"
                    disabled={pending}
                    className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={row.journal}
                    onChange={(e) => updatePaper(idx, "journal", e.target.value)}
                    placeholder="저널 (예: JAMA Dermatol)"
                    disabled={pending}
                    className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.year}
                    onChange={(e) => updatePaper(idx, "year", e.target.value)}
                    placeholder="연도"
                    min={1900}
                    max={2100}
                    disabled={pending}
                    className="h-9 w-[100px] shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removePaper(idx)}
                disabled={pending}
                aria-label="논문 삭제"
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
          onClick={addPaper}
          disabled={pending}
          className="mt-3 inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed"
        >
          + 논문 추가
        </button>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[var(--text)]">
          전문의 자격 취득연도
        </h2>
        <input
          type="number"
          inputMode="numeric"
          value={state.boardCertifiedYear}
          onChange={(e) =>
            setState((s) => ({ ...s, boardCertifiedYear: e.target.value }))
          }
          placeholder="예: 2017"
          min={1900}
          max={2100}
          disabled={pending}
          className="h-9 w-40 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          화면에 &quot;○○년 전문의 취득&quot;으로 표시됩니다.
        </p>
      </div>

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

/**
 * 운영 설정 섹션 (super admin 전용) — 근무 지점·재직·공개·slug.
 * PUT /api/admin/doctors/[slug]/settings 로 저장. profile_data 편집 흐름과 독립.
 *
 * slug 편집은 현재 미공개(is_listed=false)일 때만 활성(공개 URL 안정성 —
 * 서버 라우트도 동일 규칙으로 재검증). 공개면 slug 입력 잠금.
 */
function DoctorSettingsSection({
  slug,
  initial,
}: {
  slug: string;
  initial: DoctorSettings;
}) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string>(
    initial.clinicId != null ? String(initial.clinicId) : "",
  );
  const [isAffiliated, setIsAffiliated] = useState(initial.isAffiliated);
  const [isListed, setIsListed] = useState(initial.isListed);
  const [slugInput, setSlugInput] = useState(slug);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // slug 편집은 "현재(DB) 미공개" 상태에서만 허용. 화면의 isListed 토글을 아직
  // 저장하지 않았어도 판정 기준은 초기(DB) 값 — 서버 라우트와 동일.
  const slugEditable = !initial.isListed;

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        const body: {
          clinic_id: number | null;
          is_affiliated: boolean;
          is_listed: boolean;
          slug?: string;
        } = {
          clinic_id: clinicId ? Number(clinicId) : null,
          is_affiliated: isAffiliated,
          is_listed: isListed,
        };
        // slug 는 편집 가능하고 실제로 바뀐 경우에만 전송.
        const trimmed = slugInput.trim().toLowerCase();
        if (slugEditable && trimmed && trimmed !== slug) {
          body.slug = trimmed;
        }
        const res = await fetch(
          `/api/admin/doctors/${encodeURIComponent(slug)}/settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          setMsg({ type: "err", text: pickErrorMessage(j, res.status) });
          return;
        }
        const j = (await res.json().catch(() => null)) as
          | { slug?: string }
          | null;
        setMsg({ type: "ok", text: "운영 설정을 저장했습니다." });
        // slug 가 바뀌면 편집 URL 자체가 달라지므로 새 slug 편집 페이지로 이동.
        if (j?.slug && j.slug !== slug) {
          router.push(`/admin/doctors/${encodeURIComponent(j.slug)}/edit`);
          return;
        }
        router.refresh();
      } catch (e) {
        setMsg({
          type: "err",
          text: e instanceof Error ? e.message : "저장 실패",
        });
      }
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">
          운영 설정 (관리자 전용)
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">
          소속·재직·공개·주소(slug)
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            근무 지점
          </label>
          <select
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          >
            <option value="">지점 미지정</option>
            {CLINIC_BRANCHES.map((b) => (
              <option key={b.clinicId} value={b.clinicId}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isAffiliated}
            onChange={(e) => setIsAffiliated(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="text-xs text-[var(--text)]">
            재직 중(소속)
            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
              끄면 퇴사 처리 — 시술노트 지점 드롭다운에서 제외됩니다.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isListed}
            onChange={(e) => setIsListed(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="text-xs text-[var(--text)]">
            공개(전문의 페이지 노출)
            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
              공개 후에는 주소(slug)를 변경할 수 없습니다(URL 안정성).
            </span>
          </span>
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            원장 주소 (slug)
          </label>
          <input
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            disabled={pending || !slugEditable}
            placeholder="예: hong-gildong"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[var(--bg-soft)] disabled:opacity-70"
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {slugEditable
              ? "SEO URL /doctors/{slug}/... 에 쓰입니다. 소문자·숫자·하이픈만."
              : "공개 상태라 주소가 잠겨 있습니다. 비공개로 전환·저장한 뒤 변경하세요."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
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
          onClick={save}
          disabled={pending}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--primary)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "저장 중…" : "운영 설정 저장"}
        </button>
      </div>
    </div>
  );
}
