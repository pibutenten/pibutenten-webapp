"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  is_mapped: boolean;
  /** 매핑된 profile 이 미가입 placeholder (auth_user_id IS NULL) 인지. true 면 안전한 자동 교체 대상. */
  is_placeholder: boolean;
  /** 매핑된 profile 의 handle (placeholder 도 handle 은 있을 수 있음). */
  mapped_handle: string | null;
  /** 매핑된 profile 의 display_name. */
  mapped_display_name: string | null;
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

  // 전체 9명 doctor 모두 노출 — 이미 매핑된 doctor 도 option 에 표시 (교체 가능).
  // 사용자 요청 (2026-05-15): 매핑할 원장 리스트가 비어있는 버그 fix.
  //   이미 doctor_accounts 매핑된 doctor 제외하던 옛 필터 제거.
  const availableDoctors = doctors;

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
              {availableDoctors.map((d) => {
                const isCurrent = d.id === currentDoctorId;
                const isOther = d.is_mapped && !isCurrent;
                // 정체별 라벨 (사용자 요청 2026-05-17):
                //   - 현재 매핑       → "· 현재 매핑됨"
                //   - 미가입 placeholder → "· 미가입 placeholder · 자동 교체 OK"
                //   - 실제 가입 회원   → "· @handle 매핑 중 · 교체 시 그 회원에서 매핑 해제됨"
                let suffix = "";
                if (isCurrent) {
                  suffix = " · 현재 매핑됨";
                } else if (isOther) {
                  if (d.is_placeholder) {
                    suffix = " · 미가입 placeholder · 자동 교체 OK";
                  } else {
                    const who =
                      d.mapped_handle
                        ? `@${d.mapped_handle}`
                        : d.mapped_display_name ?? "다른 회원";
                    suffix = ` · ${who} 매핑 중 · 교체`;
                  }
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
              미가입 placeholder 매핑은 자동 해제됨. 실제 회원이 매핑된 원장 선택 시에는
              먼저 그 회원의 매핑을 풀어야 함 (API 에서 명시적 충돌 응답).
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
