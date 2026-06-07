import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { formatYmd } from "@/lib/format-date";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "병원 정보 동기화",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
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
  const hrefFor = (p: number) => `/admin/clinics?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`;
  // 현재 페이지 주변 번호 윈도우 (±2).
  const pageNums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pageNums.push(p);

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1">
        <Link
          href="/admin"
          aria-label="관리자 대시보드로"
          className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 py-1.5 text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>관리자 대시보드</span>
        </Link>
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
        {q ? `"${q}" 검색 결과 ` : ""}
        전체 {totalCount.toLocaleString()}곳 중 {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}곳 표시
        {totalPages > 1 ? ` · ${page} / ${totalPages} 페이지` : ""}
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

      {/* 페이지네이션 — 이전 / 번호 / 다음 */}
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-1" aria-label="페이지 이동">
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="이전">‹</PageLink>
          {pageNums[0] > 1 && (
            <>
              <PageLink href={hrefFor(1)}>1</PageLink>
              {pageNums[0] > 2 && <span className="px-1 text-[var(--text-muted)]">…</span>}
            </>
          )}
          {pageNums.map((p) => (
            <PageLink key={p} href={hrefFor(p)} current={p === page}>
              {p}
            </PageLink>
          ))}
          {pageNums[pageNums.length - 1] < totalPages && (
            <>
              {pageNums[pageNums.length - 1] < totalPages - 1 && <span className="px-1 text-[var(--text-muted)]">…</span>}
              <PageLink href={hrefFor(totalPages)}>{totalPages}</PageLink>
            </>
          )}
          <PageLink href={hrefFor(page + 1)} disabled={page >= totalPages} label="다음">›</PageLink>
        </nav>
      )}
    </section>
  );
}

function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border px-3 text-sm font-medium transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${base} cursor-not-allowed border-[var(--border)] text-[var(--text-muted)] opacity-50`}
      >
        {children}
      </span>
    );
  }
  if (current) {
    return (
      <span
        aria-current="page"
        className={`${base} border-[var(--primary)] bg-[var(--primary)] text-white`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${base} border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]`}
    >
      {children}
    </Link>
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
