import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicRegisterForm from "./ClinicRegisterForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "환자 등록",
  robots: { index: false, follow: false },
};

/** /clinic/patients/new — 환자 등록(동의 요청). 게이트만 서버, 폼은 클라. */
export default async function ClinicRegisterPage() {
  const supabase = await createSupabaseServerClient();
  await requireClinicPage(supabase, "/clinic/patients/new");
  return <ClinicRegisterForm />;
}
