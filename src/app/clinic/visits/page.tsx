import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClinicPage } from "@/lib/clinic-page-guard";
import ClinicVisitsView, {
  type VisitsFilters,
  type ClinicVisitListItem,
} from "./ClinicVisitsView";
import type { ClinicDoctorOption } from "../_shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술기록 관리",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

// 정렬 화이트리스트 — RPC(0350) get_clinic_visits 와 동일. 잘못된 값은 기본값 폴백.
const SORT_BY = new Set(["visited_on", "patient_name", "total_price"]);

/** "YYYY-MM-DD" 유효성 검사(searchParams 신뢰 안 함). 유효하면 그대로, 아니면 null. */
function sanitizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return null;
  const lastDay = new Date(y, mo, 0).getDate();
  if (d < 1 || d > lastDay) return null;
  return raw;
}

/** KST(UTC+9) 기준 오늘의 {year, month, day}. 서버 타임존 무관하게 한국 날짜로 계산. */
function kstToday(): { y: number; m: number; d: number } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

/** 그 달 1일~말일 "YYYY-MM-DD" 범위. */
function monthRange(y: number, m: number): { from: string; to: string } {
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

type Props = {
  searchParams: Promise<{
    view?: string;
    from?: string;
    to?: string;
    q?: string;
    doctor?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

/**
 * /clinic/visits — 시술기록 관리(지점 전체 대장 목록 + 캘린더, S4 · 계획 §2.5·C7·C13).
 *
 * searchParams(view·from·to·q·doctor·sort·dir·page) → get_clinic_visits(0350)로 초기 목록 조회.
 *   기본: from/to 미지정이면 이번 달(KST) 1일~말일, 정렬은 방문일 최신순(C13).
 *   재직 원장 목록(원장 필터용)도 서버에서 함께 조회. 이후 필터 변경은 클라가 API 재조회.
 */
export default async function ClinicVisitsPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { active } = await requireClinicPage(supabase, "/clinic/visits");

  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "list";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const doctor = sp.doctor && /^[0-9a-f-]{36}$/i.test(sp.doctor) ? sp.doctor : "";
  const sort = sp.sort && SORT_BY.has(sp.sort) ? sp.sort : "visited_on";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "desc";
  const pageRaw = parseInt(sp.page ?? "1", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

  // 기간 — from/to 지정값 우선(유효성 재검), 둘 다 없으면 이번 달(KST). 하나만 있으면 그것만 사용.
  const fromParam = sanitizeDate(sp.from);
  const toParam = sanitizeDate(sp.to);
  let from = fromParam;
  let to = toParam;
  const usingDefault = fromParam == null && toParam == null && sp.from == null && sp.to == null;
  if (usingDefault) {
    const t = kstToday();
    const r = monthRange(t.y, t.m);
    from = r.from;
    to = r.to;
  }

  // 재직 원장 목록(원장 필터 드롭다운). 다른 clinic 페이지와 동일 소스.
  const [doctorsRes, visitsRes] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, name")
      .eq("clinic_id", active.clinicId)
      .eq("is_affiliated", true)
      .order("name", { ascending: true })
      .returns<ClinicDoctorOption[]>(),
    supabase.rpc("get_clinic_visits", {
      p_clinic_profile_id: active.profileId,
      p_search: q === "" ? null : q,
      p_doctor_id: doctor === "" ? null : doctor,
      p_from: from,
      p_to: to,
      p_sort_by: sort,
      p_sort_dir: dir,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const initialFilters: VisitsFilters = {
    view,
    from: from ?? "",
    to: to ?? "",
    q,
    doctor,
    sort,
    dir,
    page,
  };

  return (
    <ClinicVisitsView
      initialVisits={(visitsRes.data ?? []) as ClinicVisitListItem[]}
      initialFilters={initialFilters}
      doctors={doctorsRes.data ?? []}
      pageSize={PAGE_SIZE}
    />
  );
}
