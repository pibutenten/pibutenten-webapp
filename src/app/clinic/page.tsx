import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicDashboardView, {
  type ClinicDashboardStats,
} from "./ClinicDashboardView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "병원 대시보드",
  robots: { index: false, follow: false },
};

/**
 * /clinic — 병원 지점 대시보드 (B4 재설계, 관리자 /admin 패턴).
 *
 * 게이트: requireClinicPage(비로그인→/login, 비-clinic→notFound).
 * 현황 숫자는 get_clinic_dashboard RPC(0349) 1회 — 연결/대기 환자·오늘/이번달 대행 노트.
 * 각 운영 프로그램(환자 등록·목록·시술노트 작성)은 /clinic/* 하위 별도 페이지.
 */
export default async function ClinicPage() {
  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase);

  const { data: statsRow } = await supabase
    .rpc("get_clinic_dashboard", { p_clinic_profile_id: active.profileId })
    .maybeSingle<ClinicDashboardStats>();

  // get_clinic_dashboard 는 patient_total 도 반환하나(연결+대기 합) 카드로는 active·pending 을
  //   따로 노출하므로 여기서 소비하지 않는다(검수 반영 — 미사용 필드 미매핑).
  const stats: ClinicDashboardStats = {
    pending_count: Number(statsRow?.pending_count ?? 0),
    active_count: Number(statsRow?.active_count ?? 0),
    notes_today: Number(statsRow?.notes_today ?? 0),
    notes_month: Number(statsRow?.notes_month ?? 0),
  };

  return (
    <ClinicDashboardView
      clinicName={active.displayName?.trim() || "병원 대시보드"}
      stats={stats}
    />
  );
}
