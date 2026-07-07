"use client";

/**
 * ClinicVisitWriteView — /clinic/visits/new 시술노트 대행 작성 (B4 재설계).
 *
 *  - ?link=<active 환자> 지정 시: DiaryForm(mode='clinic') 임베드로 바로 작성.
 *    이탈 가드(브라우저 뒤로·새로고침·내비 Link)는 DiaryForm 내부 useUnsavedChangesGuard 가
 *    자체 모달로 처리 → AppShell 뒤로가기(popstate)도 커버. 저장 성공 시 목록으로.
 *  - ?link 미지정 시: 동의 완료(active) 환자 선택 목록(각 항목 → ?link=id).
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { DiaryForm } from "@/components/skin/record/SkinDiaryForms";
import { showToast } from "@/lib/toast";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import {
  ClinicShell,
  ClinicFormTokenScope,
  BOX,
  type ClinicPatientItem,
  type ClinicDoctorOption,
} from "../../_shared";

export default function ClinicVisitWriteView({
  patient,
  activePatients,
  doctors,
  procedures,
}: {
  patient: ClinicPatientItem | null;
  activePatients: ClinicPatientItem[];
  doctors: ClinicDoctorOption[];
  procedures: ProcedureOption[];
}) {
  const router = useRouter();

  /* ── 환자 선택됨 → 작성 폼 ── */
  if (patient) {
    return (
      <ClinicShell back="/clinic/patients">
        <div className="mx-auto w-full max-w-[680px] pt-2">
          <p className="text-[13px] text-[var(--ink-500)]">
            <span className="font-semibold text-[var(--ink-900)]">
              {patient.patient_name || patient.member_handle || "환자"}
            </span>
            님의 시술노트를 작성해요.
          </p>
        </div>
        <ClinicFormTokenScope>
          <DiaryForm
            key={patient.link_id}
            mode="clinic"
            clinicPatient={{
              linkId: patient.link_id,
              patientName: patient.patient_name,
              memberHandle: patient.member_handle,
            }}
            clinicDoctors={doctors}
            procedures={procedures}
            toast={(m) => showToast(m)}
            go={() => {
              /* 병원 모드 화면 전환은 onClinicSaved 가 담당(더미) */
            }}
            onClinicSaved={() => {
              // DiaryForm 이 markSubmitted() 후 콜백하므로 가드 해제 상태 — 안전하게 이동.
              showToast("시술노트를 저장했어요. 회원에게 알림이 발송돼요.", { durationMs: 4500 });
              router.push("/clinic/patients");
            }}
          />
        </ClinicFormTokenScope>
      </ClinicShell>
    );
  }

  /* ── 미선택 → active 환자 선택 목록 ── */
  return (
    <ClinicShell back="/clinic">
      <section className="mx-auto w-full max-w-[680px] py-6">
        <h1 className="mb-1 text-[20px] font-bold text-[var(--ink-900)]">시술노트 작성</h1>
        <p className="mb-4 text-[13px] text-[var(--ink-500)]">
          시술노트를 작성할 환자를 선택하세요. 동의가 완료된 환자만 작성할 수 있어요.
        </p>
        <div className={BOX}>
          {activePatients.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[13px] leading-relaxed text-[var(--ink-300)]">
                동의가 완료된 환자가 아직 없어요.
              </p>
              <Link
                href="/clinic/patients/new"
                className="mt-3 inline-flex rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[var(--tt-blue-deep)]"
              >
                + 환자 등록
              </Link>
            </div>
          ) : (
            <div>
              {activePatients.map((it) => (
                <Link
                  key={it.link_id}
                  href={`/clinic/visits/new?link=${it.link_id}`}
                  className="flex w-full items-center gap-2 border-b border-[var(--line)] px-1 py-3 text-left last:border-0 hover:bg-[var(--tt-blue-tint)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-[var(--ink-900)]">
                      {it.patient_name || it.member_handle || "이름 미입력"}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-300)]">
                      {it.member_handle ? `@${it.member_handle}` : "아이디 없음"}
                      {it.registration_number ? ` · ${it.registration_number}` : ""}
                    </span>
                  </span>
                  <span className="text-[var(--ink-300)]">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </ClinicShell>
  );
}
