import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import { parseFreeBirthdate } from "@/components/forms/BirthdateSelect";
import ClinicPatientsView, { type PatientsFilters } from "./ClinicPatientsView";
import type { ClinicPatientItem } from "../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "환자 관리",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

// 정렬 화이트리스트 — RPC(0352) 와 동일. 잘못된 값은 기본값으로 폴백.
const SORT_BY = new Set([
  "created_at",
  "patient_name",
  "last_visit_on",
  "visit_count",
  "status",
  "patient_birthdate",
  "registration_number",
]);
const STATUS_VALUES = new Set(["pending", "active", "rejected", "revoked"]);

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

/**
 * /clinic/patients — 환자 관리(검색·정렬·필터 테이블, Wave B1).
 *
 * searchParams(q·status·sort·dir·page) → get_clinic_patients v2(0352) 로 초기 목록 조회.
 *   q 가 완전한 생일이면 p_birthdate 도 함께 전달(검색은 p_search OR p_birthdate).
 *   이후 검색·정렬·필터 변경은 클라가 /api/clinic/patients 재조회(딥링크·뒤로가기는 URL 동기).
 */
export default async function ClinicPatientsPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase, "/clinic/patients");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const status = sp.status && STATUS_VALUES.has(sp.status) ? sp.status : "";
  const sort = sp.sort && SORT_BY.has(sp.sort) ? sp.sort : "created_at";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "desc";
  const pageRaw = parseInt(sp.page ?? "1", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

  // 검색어가 완전한 생일(790126·1979-01-26 등)이면 p_birthdate 로도 전달(OR 매칭).
  const birthdate = q ? parseFreeBirthdate(q) : "";

  const { data } = await supabase.rpc("get_clinic_patients", {
    p_clinic_profile_id: active.profileId,
    p_search: q === "" ? null : q,
    p_birthdate: birthdate || null,
    p_status_filter: status === "" ? null : status,
    p_sort_by: sort,
    p_sort_dir: dir,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  const initialFilters: PatientsFilters = { q, status, sort, dir, page };

  return (
    <ClinicPatientsView
      initialPatients={(data ?? []) as ClinicPatientItem[]}
      initialFilters={initialFilters}
      pageSize={PAGE_SIZE}
    />
  );
}
