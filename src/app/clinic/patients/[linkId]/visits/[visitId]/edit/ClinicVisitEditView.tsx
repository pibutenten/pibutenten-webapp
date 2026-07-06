"use client";

/**
 * ClinicVisitEditView — /clinic/patients/[linkId]/visits/[visitId]/edit 시술노트 대행 수정·삭제 (S3a §2.6).
 *
 *  - DiaryForm(mode='clinic', clinicEditVisitId, clinicInitial) 재사용 — 편집 분기는 PATCH.
 *    이탈 가드(뒤로·새로고침·내비 Link)는 DiaryForm 내부 useUnsavedChangesGuard 가 자체 모달로 처리.
 *    저장 성공(onClinicSaved) 시 환자 상세로 복귀 + 토스트.
 *  - 하단 "이 기록 삭제"(위험 톤) → 확인 모달 → DELETE /api/clinic/visits/{id} → 성공 시 환자 상세 복귀.
 *  - 수정·삭제 알림 미발송(C13, RPC 담당).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiaryForm, type ClinicInitial } from "@/components/skin/record/SkinDiaryForms";
import { showToast } from "@/lib/toast";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import { ClinicShell, type ClinicPatientItem, type ClinicDoctorOption } from "../../../../../_shared";

export default function ClinicVisitEditView({
  linkId,
  visitId,
  patient,
  doctors,
  procedures,
  initial,
}: {
  linkId: number;
  visitId: number;
  patient: ClinicPatientItem;
  doctors: ClinicDoctorOption[];
  procedures: ProcedureOption[];
  initial: ClinicInitial;
}) {
  const router = useRouter();
  const backHref = `/clinic/patients/${linkId}`;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinic/visits/${visitId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string; message?: string };
        showToast(j?.userMessage || j?.message || "삭제에 실패했어요", { tone: "danger" });
        setDeleting(false);
        return;
      }
      setConfirmDelete(false);
      showToast("삭제했어요");
      router.push(backHref);
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
      setDeleting(false);
    }
  }

  return (
    <ClinicShell back={backHref}>
      <DiaryForm
        key={visitId}
        mode="clinic"
        clinicEditVisitId={visitId}
        clinicInitial={initial}
        clinicPatient={{
          linkId,
          patientName: patient.patient_name,
          memberHandle: patient.member_handle,
        }}
        clinicDoctors={doctors}
        procedures={procedures}
        toast={(m) => showToast(m)}
        go={() => {
          /* 병원 편집 모드 화면 전환은 onClinicSaved 가 담당(더미) */
        }}
        onClinicSaved={() => {
          // DiaryForm 이 markSubmitted() 후 콜백하므로 가드 해제 상태 — 안전하게 이동.
          showToast("시술노트를 수정했어요");
          router.push(backHref);
        }}
      />

      {/* 위험 구역 — 이 기록 삭제. 후기가 달린 기록은 서버(409)가 차단하고 안내 토스트로 사유 노출. */}
      <section className="mx-auto mb-8 w-full max-w-[680px]">
        <div className="rounded-[var(--radius)] border border-[var(--accent-soft)] bg-white p-5">
          <p className="text-[13.5px] font-semibold text-[var(--text)]">이 기록 삭제</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            삭제하면 이 시술노트가 회원 노트에서도 사라져요. 되돌릴 수 없어요.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 inline-flex h-9 items-center rounded-md border border-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
          >
            이 기록 삭제
          </button>
        </div>
      </section>

      {/* 삭제 확인 모달 — DiaryForm 의 이탈/완료 모달과 동일 오버레이 패턴. */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => { if (!deleting) setConfirmDelete(false); }}
        >
          <div
            className="w-full max-w-[340px] rounded-[var(--radius)] bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-extrabold text-[var(--text)]">이 기록을 삭제할까요?</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
              삭제하면 회원 노트에서도 사라지고 되돌릴 수 없어요.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="block flex-1 rounded-md border border-[var(--border)] bg-white py-3 text-[14.5px] font-bold text-[var(--text-secondary)] disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={deleting}
                className="block flex-1 rounded-md bg-[var(--accent)] py-3 text-[14.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ClinicShell>
  );
}
