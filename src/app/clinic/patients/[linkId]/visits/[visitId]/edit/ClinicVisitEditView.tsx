"use client";

/**
 * ClinicVisitEditView — /clinic/patients/[linkId]/visits/[visitId]/edit 시술노트 대행 보기·수정·삭제 (S3a §2.6).
 *
 *  - 진입 기본은 읽기(mode='view', T-U12): DiaryForm 대신 읽기 카드로 방문 내용을 표시하고,
 *    '수정' 버튼으로 mode='edit' 전환(→ DiaryForm 노출). page.tsx 가 ?mode=edit 이면 곧바로 편집 진입.
 *  - 편집(mode='edit'): DiaryForm(mode='clinic', clinicEditVisitId, clinicInitial) 재사용 — 편집 분기는 PATCH.
 *    이탈 가드(뒤로·새로고침·내비 Link)는 DiaryForm 내부 useUnsavedChangesGuard 가 자체 모달로 처리.
 *    저장 성공(onClinicSaved) 시 복귀 경로(backHref)로 이동 + 토스트.
 *  - 하단 "이 기록 삭제"(위험 톤) → 확인 모달 → DELETE /api/clinic/visits/{id} → 성공 시 복귀 경로로.
 *    삭제 섹션은 보기·편집 양쪽에 노출(진입 직후 바로 삭제 가능해야 함).
 *  - 복귀 경로(T-U14): 대장(from=visits&back=대장URL)에서 왔으면 그 대장(필터 유지)으로,
 *    상세에서 왔으면(파라미터 없음) 환자 상세로. back 은 open redirect 방어로 '/clinic' 접두만 허용.
 *  - 수정·삭제 알림 미발송(C13, RPC 담당).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiaryForm, type ClinicInitial } from "@/components/skin/record/SkinDiaryForms";
import { showToast } from "@/lib/toast";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import {
  ClinicShell,
  ClinicFormTokenScope,
  BOX,
  fmtVisitDate,
  fmtDateShort,
  fmtPrice,
  type ClinicPatientItem,
  type ClinicDoctorOption,
} from "../../../../../_shared";

export default function ClinicVisitEditView({
  linkId,
  visitId,
  initialMode,
  from,
  back,
  patient,
  doctors,
  procedures,
  initial,
}: {
  linkId: number;
  visitId: number;
  initialMode: "view" | "edit";
  from: string | null;
  back: string | null;
  patient: ClinicPatientItem;
  doctors: ClinicDoctorOption[];
  procedures: ProcedureOption[];
  initial: ClinicInitial;
}) {
  const router = useRouter();
  // 복귀 경로(T-U14) — 대장(from=visits)에서 온 back(필터 URL)이 '/clinic' 접두면 그대로,
  //   아니면(상세 진입·from 불일치·부적격 back) 환자 상세. startsWith('/clinic') 검증이
  //   open redirect 차단(외부 절대 URL·'//evil.com' 등 거부). from 게이트는 방어적 이중 확인.
  const backHref =
    from === "visits" && back && back.startsWith("/clinic")
      ? back
      : `/clinic/patients/${linkId}`;
  // 진입=보기, '수정' 눌러야 편집(T-U12). page.tsx 가 mode=edit 이면 곧바로 편집.
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
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
      {mode === "view" ? (
        <ClinicVisitReadCard
          patient={patient}
          doctors={doctors}
          initial={initial}
          onEdit={() => setMode("edit")}
        />
      ) : (
        <ClinicFormTokenScope>
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
        </ClinicFormTokenScope>
      )}

      {/* 위험 구역 — 이 기록 삭제. 후기가 달린 기록은 서버(409)가 차단하고 안내 토스트로 사유 노출.
          카드·구조는 admin 토큰(--r-card / --line), 삭제 위험 강조만 red-600 관례(기존 clinic 삭제 UI). */}
      <section className="mx-auto mb-8 w-full max-w-[880px]">
        <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-white p-5">
          <p className="text-[13.5px] font-semibold text-[var(--ink-900)]">이 기록 삭제</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-300)]">
            삭제하면 이 시술노트가 회원 노트에서도 사라져요. 되돌릴 수 없어요.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 inline-flex h-9 items-center rounded-[var(--r-btn)] border border-red-300 px-4 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50"
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
            className="w-full max-w-[340px] rounded-[var(--r-card)] bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-extrabold text-[var(--ink-900)]">이 기록을 삭제할까요?</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-500)]">
              삭제하면 회원 노트에서도 사라지고 되돌릴 수 없어요.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="block flex-1 rounded-[var(--r-btn)] border border-[var(--line)] bg-white py-3 text-[14.5px] font-bold text-[var(--ink-500)] disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={deleting}
                className="block flex-1 rounded-[var(--r-btn)] bg-red-600 py-3 text-[14.5px] font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
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

/**
 * 읽기 카드(T-U12) — 진입 시 편집폼 대신 방문 내용을 조회 표시. '수정' 버튼으로 편집 전환.
 *   값은 폼과 동일한 initial(ClinicInitial). 표시 톤은 환자 상세 VisitRow / DiaryDetailView 를 따르되
 *   admin 토큰(--ink·--line·--tt-blue)만 사용. 빈 값은 '—'.
 */
function ClinicVisitReadCard({
  patient,
  doctors,
  initial,
  onEdit,
}: {
  patient: ClinicPatientItem;
  doctors: ClinicDoctorOption[];
  initial: ClinicInitial;
  onEdit: () => void;
}) {
  const dateText = fmtVisitDate(initial.visited_on || null);
  // 원장명 — 저장된 doctor_name 우선, 없으면 doctor_id 로 재직 원장 드롭다운에서 조회.
  const doctorName =
    initial.doctor_name?.trim() ||
    (initial.doctor_id ? doctors.find((d) => d.id === initial.doctor_id)?.name : null) ||
    null;
  const managerName = initial.manager_name?.trim() || null;
  const totalPriceText = fmtPrice(initial.total_price ?? null);
  const nextText = fmtDateShort(initial.next_appointment_date ?? null);
  const body = initial.diary_body?.trim() || null;
  const procs = initial.procedures ?? [];

  return (
    <section className="mx-auto w-full max-w-[880px] py-6">
      <div className={BOX}>
        {/* 헤더 — 방문일 + 환자명 + '수정' 버튼 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--tt-blue-deep)]">{dateText}</p>
            <h1 className="mt-0.5 min-w-0 truncate text-[17px] font-bold text-[var(--ink-900)]">
              {patient.patient_name || patient.member_handle || "환자"} 시술 기록
            </h1>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 shrink-0 items-center rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--tt-blue-deep)]"
          >
            수정
          </button>
        </div>

        {/* 방문 요약 — 원장·실장·총액·다음예약 */}
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2.5 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
          <ReadRow label="원장" value={doctorName ? `${doctorName} 원장` : "—"} />
          <ReadRow label="실장" value={managerName ? `${managerName} 실장` : "—"} />
          <ReadRow label="총액" value={totalPriceText ?? "—"} />
          <ReadRow label="다음 예약" value={nextText ?? "—"} />
        </dl>
      </div>

      {/* 받은 시술 — 시술명 · 용량 · 가격 · 메모. 없으면 안내. */}
      <div className={`${BOX} mt-4`}>
        <h2 className="text-[14px] font-bold text-[var(--ink-900)]">받은 시술</h2>
        {procs.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--ink-500)]">등록된 시술이 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {procs.map((p, i) => {
              const priceText = fmtPrice(p.price ?? null);
              return (
                <li
                  key={i}
                  className="rounded-[var(--r-btn)] border border-[var(--line)] p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-[14px] font-semibold text-[var(--ink-900)]">
                      {p.procedure_ko}
                      {p.unit_text?.trim() && (
                        <span className="ml-1 text-[12.5px] font-medium text-[var(--ink-500)]">
                          {p.unit_text}
                        </span>
                      )}
                    </span>
                    {priceText && (
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--ink-700)] tabular-nums">
                        {priceText}
                      </span>
                    )}
                  </div>
                  {p.note?.trim() && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-500)]">
                      {p.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 시술노트 본문 — 있을 때만. */}
      {body && (
        <div className={`${BOX} mt-4`}>
          <h2 className="text-[14px] font-bold text-[var(--ink-900)]">시술노트</h2>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--ink-700)]">
            {body}
          </p>
        </div>
      )}
    </section>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[64px] shrink-0 text-[13px] text-[var(--ink-300)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-keep text-[13.5px] text-[var(--ink-700)]">{value}</dd>
    </div>
  );
}
