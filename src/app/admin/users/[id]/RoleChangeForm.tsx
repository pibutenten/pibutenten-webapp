"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  is_mapped: boolean;
};

type Props = {
  userId: string;
  currentRole: "admin" | "doctor" | "user";
  currentDoctorId: string | null;
  doctors: Doctor[];
};

/**
 * 관리자 회원 역할 변경 폼.
 * - role: user/doctor/admin
 * - doctor 선택 시 doctor_id 매핑 (doctor_accounts upsert)
 * - 다른 role로 변경 시 기존 매핑 자동 제거 (서버에서 처리)
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
    role !== currentRole ||
    (role === "doctor" && doctorId !== (currentDoctorId ?? ""));

  // 다른 사람이 매핑된 doctor 제외 (본인이 이미 매핑된 doctor는 OK)
  const availableDoctors = doctors.filter(
    (d) => !d.is_mapped || d.id === currentDoctorId,
  );

  function save() {
    setMsg(null);
    if (role === "doctor" && !doctorId) {
      setMsg({ type: "err", text: "원장 매핑을 선택해주세요." });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            doctor_id: role === "doctor" ? doctorId : null,
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
        🔐 역할 / 권한 변경
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
            <option value="user">회원 (일반)</option>
            <option value="doctor">원장</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        {role === "doctor" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              매핑할 원장
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={pending}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">— 선택 —</option>
              {availableDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.branch ? ` (${d.branch})` : ""}
                  {d.is_mapped && d.id === currentDoctorId ? " · 현재 매핑됨" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              이미 다른 회원에게 매핑된 원장은 목록에 표시되지 않습니다.
            </p>
          </div>
        )}
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
