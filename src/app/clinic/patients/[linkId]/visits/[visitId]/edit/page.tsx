import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import { getReviewProcedures } from "@/lib/review-procedures";
import ClinicVisitEditView from "./ClinicVisitEditView";
import type { ClinicPatientItem, ClinicDoctorOption } from "../../../../../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술노트 수정",
  robots: { index: false, follow: false },
};

/** get_clinic_patient_visits(0350) 1행 — 그 환자 시술기록 타임라인 항목. */
type ClinicVisitRow = {
  diary_id: number;
  visited_on: string;
  visited_on_precision: string;
  doctor_name: string | null;
  doctor_id: string | null;
  manager_name: string | null;
  diary_body: string | null;
  total_price: number | null;
  next_appointment_date: string | null;
  created_at: string;
  updated_at: string;
  procedures: {
    id: number;
    procedure_ko: string;
    tag_dict_ko: string | null;
    unit_text: string | null;
    price: number | null;
    note: string | null;
    sort_order: number;
  }[];
};

/**
 * /clinic/patients/[linkId]/visits/[visitId]/edit — 시술노트 대행 수정·삭제 (S3a, 계획 §2.6).
 *
 * 서버가 fresh 로드: 그 환자(get_clinic_patient_visits) 기록 목록에서 diary_id=visitId 행을 찾아
 * DiaryForm(mode='clinic', clinicEditVisitId) 초기값으로 주입. 미존재·타 지점이면 404(RPC 3중 소유경계).
 * 원장 드롭다운·시술 사전은 작성 페이지와 동일 소스(재직 원장·getReviewProcedures).
 */
export default async function ClinicVisitEditPage({
  params,
}: {
  params: Promise<{ linkId: string; visitId: string }>;
}) {
  const { linkId: rawLinkId, visitId: rawVisitId } = await params;
  const linkId = /^\d+$/.test(rawLinkId) ? Number(rawLinkId) : NaN;
  const visitId = /^\d+$/.test(rawVisitId) ? Number(rawVisitId) : NaN;
  if (!Number.isSafeInteger(linkId) || linkId <= 0) notFound();
  if (!Number.isSafeInteger(visitId) || visitId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(
    supabase,
    `/clinic/patients/${linkId}/visits/${visitId}/edit`,
  );

  const [doctorsRes, procedures, patientRes, visitsRes] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, name")
      .eq("clinic_id", active.clinicId)
      .eq("is_affiliated", true)
      .order("name", { ascending: true })
      .returns<ClinicDoctorOption[]>(),
    getReviewProcedures(supabase),
    supabase
      .rpc("get_clinic_patient", {
        p_clinic_profile_id: active.profileId,
        p_link_id: linkId,
      })
      .maybeSingle<ClinicPatientItem>(),
    supabase.rpc("get_clinic_patient_visits", {
      p_clinic_profile_id: active.profileId,
      p_link_id: linkId,
    }),
  ]);

  const patient = patientRes.data;
  if (!patient) notFound(); // 자기 지점 연결 아님 → 404.

  const visits = (visitsRes.data ?? []) as ClinicVisitRow[];
  const visit = visits.find((v) => v.diary_id === visitId);
  if (!visit) notFound(); // 그 환자 기록에 없는 diary → 404(3중 소유경계 비구분).

  return (
    <ClinicVisitEditView
      linkId={linkId}
      visitId={visitId}
      patient={patient}
      doctors={doctorsRes.data ?? []}
      procedures={procedures}
      initial={{
        visited_on: visit.visited_on,
        procedures: (visit.procedures ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((pr) => ({
            procedure_ko: pr.procedure_ko,
            note: pr.note,
            unit_text: pr.unit_text,
            price: pr.price,
          })),
        doctor_id: visit.doctor_id,
        doctor_name: visit.doctor_name,
        manager_name: visit.manager_name,
        diary_body: visit.diary_body,
        total_price: visit.total_price,
        next_appointment_date: visit.next_appointment_date,
      }}
    />
  );
}
