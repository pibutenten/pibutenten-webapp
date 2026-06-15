import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BetaAdminClinicsView, {
  type BetaClinicRow,
} from "./BetaAdminClinicsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "병원 정보 동기화",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

type ClinicRow = BetaClinicRow;

/**
 * /admin/clinics — 병원(피부과 의원) 정보 동기화 운영 페이지 (super admin 전용, 베타 셸 적용 Phase 3 ②).
 * 상단: 총 등록 병원 수 + 최근 동기화 시각 + "병원 정보 가져오기" 버튼.
 * 하단: 이름·주소·전화·종별 목록 (상위 50개 + 병원명 검색).
 *
 * 원칙: 가드·데이터 fetch·페이지 계산은 운영 그대로 유지하고, 렌더만 BetaAdminClinicsView(베타 셸 래퍼)로 위임한다.
 */
export default async function AdminClinicsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/clinics", { superAdminOnly: true });
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const reqPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createSupabaseServerClient();

  // 전체 병원 수(상단 Stat) + 최근 동기화 시각 + (검색 시) 조건부 건수 — 병렬.
  const [{ count: total }, latest, filtered] = await Promise.all([
    supabase.from("clinics").select("id", { count: "exact", head: true }),
    supabase
      .from("clinics")
      .select("synced_at")
      .order("synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    q
      ? supabase.from("clinics").select("id", { count: "exact", head: true }).ilike("name", `%${q}%`)
      : Promise.resolve({ count: null } as { count: number | null }),
  ]);

  const totalAll = total ?? 0;
  // 검색 없으면 전체 건수 재사용(중복 count 쿼리 회피).
  const totalCount = q ? (filtered.count ?? 0) : totalAll;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // 범위를 벗어난 page 요청은 마지막 페이지로 클램프.
  const page = Math.min(reqPage, totalPages);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // 목록 — 검색어 있으면 병원명 부분검색(ilike), 이름순 + 현재 페이지 범위만.
  let listQuery = supabase
    .from("clinics")
    .select("id,name,addr,tel,clinic_type,synced_at")
    .order("name", { ascending: true })
    .range(from, to);
  if (q) listQuery = listQuery.ilike("name", `%${q}%`);
  const { data: rows } = await listQuery;
  const clinics = (rows ?? []) as ClinicRow[];

  const lastSynced = latest.data?.synced_at ?? null;
  const rangeStart = totalCount === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + PAGE_SIZE, totalCount);
  // 현재 페이지 주변 번호 윈도우 (±2).
  const pageNums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pageNums.push(p);

  return (
    <BetaAdminClinicsView
      clinics={clinics}
      total={totalAll}
      totalCount={totalCount}
      totalPages={totalPages}
      page={page}
      pageNums={pageNums}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      lastSynced={lastSynced}
      q={q}
    />
  );
}
