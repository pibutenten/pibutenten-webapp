"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  is_mapped: boolean;
  /** 매핑된 profile 의 handle. 충돌 표시용. */
  mapped_handle: string | null;
  /** 매핑된 profile 의 display_name. 충돌 표시용. */
  mapped_display_name: string | null;
};

type Props = {
  userId: string;
  currentRole: "admin" | "doctor" | "user";
  currentDoctorId: string | null;
  doctors: Doctor[];
};

/**
 * 관리자 회원 역할·매핑 변경 폼.
 *
 * 정책 (2026-05-17):
 * - 역할 dropdown: 회원 (user) / 관리자 (admin) 만 선택 가능. '원장' 옵션 폐기.
 *   기존 6개 doctor 본 profile 은 role='doctor' 그대로 유지 (legacy, disabled option 으로만 노출).
 * - 매핑할 원장 dropdown: 역할과 무관하게 항상 표시. user 도 admin 도 매핑 가능.
 * - 매핑 추가/해제 시 profiles.role 자동 변경 없음. display_name 자동 sync 없음.
 *   매핑된 user 계정은 화면에서 그대로 user 로 표시되고, 원장 모드 활동은
 *   IdentitySwitcher 에서 명시 전환할 때만.
 */
export default function RoleChangeForm({
  userId,
  currentRole,
  currentDoctorId,
  doctors,
}: Props) {
  const router = useRouter();
  const [role, setRole] = useState<Props["currentRole"]>(currentRole);
  const [doctorId, setDoctorId] = useState<string>(currentDoctorId ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const dirty =
    role !== currentRole || doctorId !== (currentDoctorId ?? "");

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // role 과 doctor_id 를 독립적으로 전송 — 서버에서 각각 처리.
          //   doctor_id=null → 매핑 해제 / doctor_id=값 → 매핑 추가·교체.
          //   role 변경은 별개 (자동 sync 없음).
          body: JSON.stringify({
            role,
            doctor_id: doctorId || null,
          }),
        });
        const j = (await res.json()) as { error?: string; ok?: boolean };
        if (!res.ok || !j.ok) {
          setMsg({ type: "err", text: j.error ?? "변경 실패" });
          return;
        }
        setMsg({ type: "ok", text: "변경되었습니다." });
        router.refresh();
      } catch (e) {
        setMsg({
          type: "err",
          text: e instanceof Error ? e.message : "네트워크 오류",
        });
      }
    });
  }

  return (
    <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
      <h2 className="mb-3 text-sm font-bold text-[var(--text)]">
        🔐 역할 / 매핑 변경
      </h2>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            역할
          </label>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as Props["currentRole"])
            }
            disabled={pending}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="user">회원</option>
            <option value="admin">관리자</option>
            {/* legacy doctor 본 profile (6개) 만 자기 자신 옵션으로 노출.
                disabled — 신규 할당 불가, 기존 상태만 유지. */}
            {currentRole === "doctor" && (
              <option value="doctor" disabled>
                원장 (legacy · doctor 본 profile)
              </option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            매핑할 원장
            <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
              (역할과 무관 · 비워두면 매핑 해제)
            </span>
          </label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">— 매핑 없음 —</option>
            {doctors.map((d) => {
              const isCurrent = d.id === currentDoctorId;
              const isOther = d.is_mapped && !isCurrent;
              let suffix = "";
              if (isCurrent) {
                suffix = " · 현재 매핑됨";
              } else if (isOther) {
                const who =
                  d.mapped_handle
                    ? `@${d.mapped_handle}`
                    : d.mapped_display_name ?? "다른 회원";
                suffix = ` · ${who} 매핑 중 · 교체`;
              }
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {suffix}
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            매핑은 "이 계정이 해당 원장으로 활동 가능" 표시만. 화면엔 그대로 user 로
            보이고, 원장 모드 전환은 IdentitySwitcher 에서.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {msg && (
            <span
              className={
                "text-xs " +
                (msg.type === "ok" ? "text-emerald-700" : "text-red-600")
              }
            >
              {msg.text}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="h-9 whitespace-nowrap rounded-md border border-[var(--primary)] bg-transparent px-4 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
