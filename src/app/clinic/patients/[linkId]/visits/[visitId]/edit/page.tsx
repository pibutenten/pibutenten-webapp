import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import { getReviewProcedures } from "@/lib/review-procedures";
import ClinicVisitEditView from "./ClinicVisitEditView";
// get_clinic_patient_visits(0350) 1행 타입은 환자 상세 뷰의 ClinicVisitItem 을 SSOT 로 재사용
//   (같은 RPC 를 소비하므로 로컬 재선언 금지 — 구조 drift 방지).
import { type ClinicVisitItem } from "../../../ClinicPatientDetailView";
import type { ClinicPatientItem, ClinicDoctorOption } from "../../../../../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술노트 수정",
  robots: { index: false, follow: false },
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
  searchParams,
}: {
  params: Promise<{ linkId: string; visitId: string }>;
  searchParams: Promise<{ mode?: string; from?: string; back?: string }>;
}) {
  const { linkId: rawLinkId, visitId: rawVisitId } = await params;
  const { mode: rawMode, from, back } = await searchParams;
  // 진입 기본은 읽기(보기) — '수정' 버튼으로 편집 전환(T-U12). mode=edit 만 명시적으로 편집 진입.
  const initialMode: "view" | "edit" = rawMode === "edit" ? "edit" : "view";
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

  const visits = (visitsRes.data ?? []) as ClinicVisitItem[];
  const visit = visits.find((v) => v.diary_id === visitId);
  if (!visit) notFound(); // 그 환자 기록에 없는 diary → 404(3중 소유경계 비구분).

  return (
    <ClinicVisitEditView
      linkId={linkId}
      visitId={visitId}
      initialMode={initialMode}
      // 복귀 경로 원본(T-U14) — from=visits(대장)에서 왔으면 그 필터 URL(back)로, 아니면(상세 진입) 상세로.
      //   back 의 open redirect 방어(startsWith('/clinic'))는 뷰가 담당.
      from={from ?? null}
      back={back ?? null}
      patient={patient}
      doctors={doctorsRes.data ?? []}
      procedures={procedures}
      initial={{
        // ClinicVisitItem 은 visited_on/procedure_ko/sort_order 가 nullable(더 넓은 SSOT 타입)이므로
        //   ClinicInitial 계약(visited_on: string, procedure_ko: string)에 맞게 coalesce/필터한다.
        //   빈 visited_on 은 폼 lazy initializer 가 오늘로 폴백(clinic 방문은 실제로 항상 값 존재).
        visited_on: visit.visited_on ?? "",
        procedures: (visit.procedures ?? [])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .filter((pr): pr is typeof pr & { procedure_ko: string } => !!pr.procedure_ko)
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
