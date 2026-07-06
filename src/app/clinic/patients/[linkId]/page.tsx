import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicPatientDetailView, { type ClinicVisitItem } from "./ClinicPatientDetailView";
import type { ClinicPatientItem } from "../../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "환자 상세",
  robots: { index: false, follow: false },
};

/** /clinic/patients/[linkId] — 환자 상세. 서버가 fresh 로드(자기 지점 연결만, 아니면 404). */
export default async function ClinicPatientDetailPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;
  const id = /^\d+$/.test(linkId) ? Number(linkId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase, `/clinic/patients/${linkId}`);

  // 단건 프로필 + 그 환자 시술기록 타임라인(0350)을 병렬 조회. force-dynamic 이라 매 진입 fresh.
  const [{ data }, { data: visitsData }] = await Promise.all([
    supabase
      .rpc("get_clinic_patient", {
        p_clinic_profile_id: active.profileId,
        p_link_id: id,
      })
      .maybeSingle<ClinicPatientItem>(),
    supabase.rpc("get_clinic_patient_visits", {
      p_clinic_profile_id: active.profileId,
      p_link_id: id,
    }),
  ]);

  if (!data) notFound();

  const visits = (visitsData ?? []) as ClinicVisitItem[];

  return <ClinicPatientDetailView patient={data} visits={visits} />;
}
