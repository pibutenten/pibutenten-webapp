import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { getReviewProcedures } from "@/lib/review-procedures";
import ClinicDashboardClient, {
  type ClinicPatientItem,
} from "./ClinicDashboardClient";

export const dynamic = "force-dynamic";

// 병원 전용 내부 화면 — 검색 노출 금지(마이페이지·온보딩과 동일 noindex 패턴).
export const metadata: Metadata = {
  title: "병원 대시보드",
  robots: { index: false, follow: false },
};

/** 병원 모드 원장 드롭다운 항목 — DiaryForm clinicDoctors prop 과 동일 형태. */
type ClinicDoctorOption = { id: string; name: string };

/**
 * /clinic — 병원 지점 대시보드 (병원계정 B4, 계획 §8.1).
 *
 * 게이트: 비로그인 → /login?next=/clinic. active 명함이 role='clinic' + clinic_id 보유가
 *   아니면 notFound() — 병원 화면의 존재 자체를 일반 회원에게 숨긴다(§8.1 is_clinic 게이트).
 *   route-class.ts::RESERVED_FIRST_SEGMENT 에 'clinic' 등록 완료 → 핸들 라우트와 충돌 없음.
 *
 * 서버 조회(병렬):
 *   - 소속 재직 원장: doctors WHERE clinic_id = active.clinicId AND is_affiliated = true
 *     (0341 — 공개 테이블 직접 SELECT. is_listed 무관: 드롭다운은 재직 기준 §8.1③)
 *   - 시술 사전: getReviewProcedures (tag_dictionary is_procedure — /write 와 동일 소스)
 *   - 초기 환자 목록: get_clinic_patients RPC(0345 — 자기 지점 연결만, 검색은 클라가
 *     GET /api/clinic/patients?q= 로 재조회)
 *
 * ※ deferred — 계획 §8.1 의 헤더 "오늘 작성 건수"는 병원이 자기 작성 노트(diaries
 *   source='clinic')를 집계 조회할 RPC 가 아직 없어 이번 범위에서 제외. 조회 RPC
 *   (예: get_clinic_today_visit_count) 신설 시 헤더에 추가한다.
 */
export default async function ClinicPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/clinic");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;
  if (!active || active.role !== ROLES.CLINIC || active.clinicId == null) {
    notFound();
  }

  // 세 조회는 서로 독립 → 병렬(첫 라운드트립 묶기 — /write 서버 패턴과 동일).
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
  const initialPatients = (patientsRes.data ?? []) as ClinicPatientItem[];

  return (
    <ClinicDashboardClient
      clinicName={active.displayName?.trim() || "병원 대시보드"}
      doctors={doctors}
      procedures={procedures}
      initialPatients={initialPatients}
    />
  );
}
