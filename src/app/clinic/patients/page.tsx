import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicPatientsView from "./ClinicPatientsView";
import type { ClinicPatientItem } from "../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "환자 목록",
  robots: { index: false, follow: false },
};

/** /clinic/patients — 환자 목록/검색. 초기 목록만 서버 조회, 검색은 클라 재조회. */
export default async function ClinicPatientsPage() {
  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase, "/clinic/patients");

  const { data } = await supabase.rpc("get_clinic_patients", {
    p_clinic_profile_id: active.profileId,
    p_search: null,
  });

  return <ClinicPatientsView initialPatients={(data ?? []) as ClinicPatientItem[]} />;
}
