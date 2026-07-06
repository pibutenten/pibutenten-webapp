import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicPatientDetailView from "./ClinicPatientDetailView";
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

  const { data } = await supabase
    .rpc("get_clinic_patient", {
      p_clinic_profile_id: active.profileId,
      p_link_id: id,
    })
    .maybeSingle<ClinicPatientItem>();

  if (!data) notFound();

  return <ClinicPatientDetailView patient={data} />;
}
