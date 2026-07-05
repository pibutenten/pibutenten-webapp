"use client";

/**
 * CreateDoctorProfileForm — 원장 계정 연결 (CRITICAL-3 제거 자리 대체, 2026-05-30).
 *
 * 선택한 회원 명함을 원본으로, 같은 묶음에 새 원장 명함을 신설한다.
 * POST /api/admin/users/[id]/doctor-profile → RPC admin_create_doctor_profile.
 *
 * ★ 회원 명함의 role·글은 건드리지 않는다 (서버 RPC 가 INSERT 만 수행).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLINIC_BRANCHES } from "@/lib/clinic-branches";

type Props = {
  sourceProfileId: string;
  sourceDisplayName: string;
  sourceOnboarded: boolean;
};

export default function CreateDoctorProfileForm({
  sourceProfileId,
  sourceDisplayName,
  sourceOnboarded,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState(sourceDisplayName ?? "");
  const [clinic, setClinic] = useState("");
  const [branch, setBranch] = useState("");
  const [title, setTitle] = useState("");
  // 근무 지점(clinic_id). "" = 미지정. 선택 시 branch 텍스트도 자동 채움.
  const [clinicId, setClinicId] = useState<string>("");
  // 공개 여부(is_listed). 기본 off — 신규 원장은 비공개 기본.
  const [isListed, setIsListed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ handle: string; slug: string } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slug.trim() || !name.trim()) {
      setError("원장 주소(slug)와 이름은 필수입니다.");
      return;
    }
    if (
      !window.confirm(
        `'${name}' 원장 명함을 새로 만들고 이 회원의 정보를 복사합니다.\n` +
          `회원 명함과 회원 글은 그대로 유지됩니다. 진행할까요?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/users/${sourceProfileId}/doctor-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: slug.trim().toLowerCase(),
            name: name.trim(),
            clinic: clinic.trim() || undefined,
            branch: branch.trim() || undefined,
            title: title.trim() || undefined,
            clinic_id: clinicId ? Number(clinicId) : undefined,
            is_listed: isListed,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.message ?? "원장 명함 생성에 실패했습니다.");
        return;
      }
      setDone({ handle: json.handle, slug: json.slug });
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-4">
        <h2 className="mb-1 text-sm font-bold text-[var(--text)]">
          원장 명함이 생성되었습니다
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          새 원장 주소(slug): <b>{done.slug}</b> · 핸들: @{done.handle}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          회원 명함과 회원 글은 변경되지 않았습니다. 같은 묶음의 ID 칩에서 전환할
          수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--text)]">
          🩺 원장 명함 신설·연결
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!sourceOnboarded}
            className="rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            원장 명함 생성
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-[var(--text-muted)]">
        이 회원과 같은 묶음에 <b>새 원장 명함</b>을 만들고, 회원의 온보딩 정보(생년월일·성별·피부정보 등)를 복사합니다.
        회원 명함의 역할과 회원이 쓴 글은 <b>그대로 유지</b>됩니다.
      </p>

      {!sourceOnboarded && (
        <p className="mt-2 rounded bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
          이 회원은 온보딩(생년월일 등)을 완료하지 않아 원장 명함을 만들 수 없습니다.
        </p>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field
            label="원장 주소 (slug) *"
            hint="SEO URL /doctors/{slug}/... 에 쓰입니다. 소문자·숫자·하이픈만."
          >
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="예: hong-gildong"
              className="w-full rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm"
              required
            />
          </Field>
          <Field label="원장 이름 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm"
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="병원명" hint="비우면 '힐하우스피부과'">
              <input
                value={clinic}
                onChange={(e) => setClinic(e.target.value)}
                placeholder="힐하우스피부과"
                className="w-full rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm"
              />
            </Field>
            <Field
              label="근무 지점"
              hint="선택 시 근무지 코드(clinic_id)와 지점명이 함께 저장됩니다."
            >
              <select
                value={clinicId}
                onChange={(e) => {
                  const v = e.target.value;
                  setClinicId(v);
                  // 지점 선택 시 아래 지점명 텍스트도 자동으로 해당 지점명으로 채움.
                  const found = CLINIC_BRANCHES.find(
                    (b) => String(b.clinicId) === v,
                  );
                  if (found) setBranch(found.branch);
                }}
                className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
              >
                <option value="">지점 미지정</option>
                {CLINIC_BRANCHES.map((b) => (
                  <option key={b.clinicId} value={b.clinicId}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="지점명(표시용)"
            hint="화면 표시용 지점명. 위에서 근무 지점을 고르면 자동으로 채워집니다."
          >
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="예: 강남점"
              className="w-full rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="직함" hint="비우면 '피부과 전문의'">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="피부과 전문의"
              className="w-full rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm"
            />
          </Field>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={isListed}
              onChange={(e) => setIsListed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-xs text-[var(--text)]">
              공개(전문의 페이지 노출)
              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                기본은 비공개입니다. 프로필을 채운 뒤 공개로 전환하는 것을 권장합니다.
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "생성 중…" : "원장 명함 생성"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
          {hint}
        </span>
      )}
    </label>
  );
}
