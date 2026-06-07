import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { formatYmd } from "@/lib/format-date";
import BackButton from "@/components/BackButton";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "병원 정보 동기화",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ q?: string }>;
};

type ClinicRow = {
  id: number;
  name: string;
  addr: string | null;
  tel: string | null;
  clinic_type: string | null;
  synced_at: string | null;
};

/**
 * /admin/clinics — 병원(피부과 의원) 정보 동기화 운영 페이지 (super admin 전용).
 * 상단: 총 등록 병원 수 + 최근 동기화 시각 + "병원 정보 가져오기" 버튼.
 * 하단: 이름·주소·전화·종별 목록 (상위 50개 + 병원명 검색).
 */
export default async function AdminClinicsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/clinics", { superAdminOnly: true });
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // 총 병원 수 (정확 count) + 최근 동기화 시각.
  const [{ count: total }, latest] = await Promise.all([
    supabase.from("clinics").select("id", { count: "exact", head: true }),
    supabase
      .from("clinics")
      .select("synced_at")
      .order("synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // 목록 — 검색어 있으면 병원명 부분검색(ilike), 없으면 이름순 상위 N.
  let listQuery = supabase
    .from("clinics")
    .select("id,name,addr,tel,clinic_type,synced_at")
    .order("name", { ascending: true })
    .limit(PAGE_SIZE);
  if (q) listQuery = listQuery.ilike("name", `%${q}%`);
  const { data: rows } = await listQuery;
  const clinics = (rows ?? []) as ClinicRow[];

  const lastSynced = latest.data?.synced_at ?? null;

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">병원 정보 동기화</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          건강보험심사평가원 병원정보서비스 기반 피부과 의원 참조 데이터 (영구 noindex)
        </p>
      </div>

      {/* 상단 요약 + 가져오기 버튼 */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Stat label="총 등록 병원" value={(total ?? 0).toLocaleString()} />
          <Stat
            label="최근 동기화"
            value={lastSynced ? formatYmd(lastSynced) : "없음"}
          />
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
          <SyncButton />
        </div>
      </div>

      {/* 검색 */}
      <form action="/admin/clinics" method="get" className="mb-3 flex items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="병원명 검색 (예: 서울피부)"
          className="h-9 flex-1 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
        >
          검색
        </button>
      </form>

      <p className="mb-2 text-xs text-[var(--text-muted)]">
        {q ? `"${q}" 검색 결과` : "이름순 상위"} {clinics.length.toLocaleString()}곳 표시
        {!q && (total ?? 0) > PAGE_SIZE ? ` (전체 ${(total ?? 0).toLocaleString()}곳 중)` : ""}
      </p>

      {/* 목록 테이블 */}
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-soft)] text-left text-xs text-[var(--text-secondary)]">
              <th className="px-3 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">주소</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">전화</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">종별</th>
            </tr>
          </thead>
          <tbody>
            {clinics.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[var(--text-muted)]">
                  {q
                    ? "검색 결과가 없습니다."
                    : "등록된 병원이 없습니다. '병원 정보 가져오기'로 동기화하세요."}
                </td>
              </tr>
            ) : (
              clinics.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-soft)]"
                >
                  <td className="px-3 py-2 font-medium text-[var(--text)]">{c.name}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{c.addr ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-secondary)]">
                    {c.tel ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                    {c.clinic_type ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-3">
      <div className="whitespace-nowrap text-[11px] leading-tight text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-[var(--text)] sm:text-2xl">
        {value}
      </div>
    </div>
  );
}
