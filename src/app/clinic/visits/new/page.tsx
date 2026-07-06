import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import { getReviewProcedures } from "@/lib/review-procedures";
import ClinicVisitWriteView from "./ClinicVisitWriteView";
import type { ClinicPatientItem, ClinicDoctorOption } from "../../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술노트 작성",
  robots: { index: false, follow: false },
};

/**
 * /clinic/visits/new — 시술노트 대행 작성.
 *   ?link=<active 환자> 이면 그 환자 작성 폼, 아니면 active 환자 선택 목록.
 *   원장 드롭다운·시술 사전은 /clinic 대시보드와 동일 소스(재직 원장·getReviewProcedures).
 */
export default async function ClinicVisitNewPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase, "/clinic/visits/new");

  const [doctorsRes, procedures, patientsRes] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, name")
      .eq("clinic_id", active.clinicId)
      .eq("is_affiliated", true)
      .order("name", { ascending: true })
      .returns<ClinicDoctorOption[]>(),
    getReviewProcedures(supabase),
    supabase.rpc("get_clinic_patients", {
      p_clinic_profile_id: active.profileId,
      p_search: null,
    }),
  ]);

  const doctors = doctorsRes.data ?? [];
  const allPatients = (patientsRes.data ?? []) as ClinicPatientItem[];
  const activePatients = allPatients.filter((p) => p.status === "active");

  // ?link 지정 — active 환자면 작성, 비-active 는 상세로(사유 안내), 없으면 선택 목록.
  const { link } = await searchParams;
  const linkId = link && /^\d+$/.test(link) ? Number(link) : null;
  let patient: ClinicPatientItem | null = null;
  if (linkId != null) {
    const target = allPatients.find((p) => p.link_id === linkId);
    if (target && target.status === "active") {
      patient = target;
    } else if (target) {
      redirect(`/clinic/patients/${linkId}`); // 비-active — 상세에서 상태 안내
    } else {
      redirect("/clinic/visits/new"); // 유효하지 않은 link(타 지점·미존재) — 쿼리 제거 후 선택 목록
    }
  }

  return (
    <ClinicVisitWriteView
      patient={patient}
      activePatients={activePatients}
      doctors={doctors}
      procedures={procedures}
    />
  );
}
