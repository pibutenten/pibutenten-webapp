"use client";

/**
 * ClinicPatientsView — /clinic/patients 환자 관리(검색·정렬·필터 테이블, Wave B1).
 *
 * 관리자 회원관리(/admin/users)와 동일한 톤·패턴의 서버 톤 테이블을 이식했습니다.
 *   - 색은 admin 토큰만(--ink / --tt-blue / --line 계열). --primary·--text 미사용.
 *   - 검색 = 통합 입력창(이름·등록번호·아이디·생일). 클라가 parseFreeBirthdate 로 날짜 판정 →
 *     완전한 생일이면 birthdate(YYYY-MM-DD)를 동반 전달(p_search OR p_birthdate, 둘 중 하나 매칭).
 *   - 정렬은 헤더 클릭(▲▼) 토글, 상태는 칩. 모든 필터는 URL(searchParams)과 동기(딥링크·뒤로가기).
 *   - 반응형: md↑ 표(가로스크롤), md↓ 카드(+ 정렬 드롭다운). 날짜는 연도 포함 YYYY.MM.DD.
 *
 * 서버(page.tsx)가 초기 목록·필터를 주고, 이후 변경은 300ms 디바운스로
 *   GET /api/clinic/patients 재조회. 행 클릭 → /clinic/patients/[linkId] 상세.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { GENDERS } from "@/lib/profile-options";
import { parseFreeBirthdate } from "@/components/forms/BirthdateSelect";
import { ClinicShell, StatusBadge, type ClinicPatientItem } from "../_shared";

export type PatientsFilters = {
  q: string;
  status: string;
  sort: string;
  dir: "asc" | "desc" | string;
  page: number;
};

// 성별 라벨 — GENDERS(SSOT) 파생(하드코딩 금지, _shared 방식). 테이블은 좁아 짧게(여/남).
const GENDER_SHORT: Record<string, string> = Object.fromEntries(
  GENDERS.map((g) => [g.key, g.label.replace(/성$/, "")]),
);
function genderLabel(sp: Record<string, unknown> | null): string {
  const g = sp && typeof sp.gender === "string" ? sp.gender : "";
  return g ? GENDER_SHORT[g] ?? g : "—";
}

// 상태 필터 칩 — 전체 + 4상태. StatusBadge 와 같은 4상태 라벨.
const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "active", label: "연결됨" },
  { value: "pending", label: "동의 대기" },
  { value: "rejected", label: "거절" },
  { value: "revoked", label: "해제" },
];

// 정렬 가능 컬럼 — 라벨은 헤더/드롭다운 공용.
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at", label: "등록일" },
  { value: "patient_name", label: "이름" },
  { value: "patient_birthdate", label: "생년월일" },
  { value: "last_visit_on", label: "최근 시술일" },
  { value: "visit_count", label: "시술 수" },
  { value: "status", label: "상태" },
];
const SORTABLE = new Set(SORT_OPTIONS.map((o) => o.value));

/** "YYYY-MM-DD"|ISO → "YYYY.MM.DD"(연도 포함). 파싱 실패 시 "—". */
function fmtYmd(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${day}`;
}

export default function ClinicPatientsView({
  initialPatients,
  initialFilters,
  pageSize,
}: {
  initialPatients: ClinicPatientItem[];
  initialFilters: PatientsFilters;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<ClinicPatientItem[]>(initialPatients);
  const [q, setQ] = useState(initialFilters.q);
  const [status, setStatus] = useState(initialFilters.status);
  const [sort, setSort] = useState(
    SORTABLE.has(initialFilters.sort) ? initialFilters.sort : "created_at",
  );
  const [dir, setDir] = useState<"asc" | "desc">(
    initialFilters.dir === "asc" ? "asc" : "desc",
  );
  const [page, setPage] = useState(initialFilters.page > 0 ? initialFilters.page : 1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPatients.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);

  // URL 동기 — 현재 필터를 searchParams 로. page=1 은 생략(깔끔).
  const syncUrl = useCallback(
    (f: { q: string; status: string; sort: string; dir: string; page: number }) => {
      const params = new URLSearchParams();
      if (f.q) params.set("q", f.q);
      if (f.status) params.set("status", f.status);
      if (f.sort && f.sort !== "created_at") params.set("sort", f.sort);
      if (f.dir && f.dir !== "desc") params.set("dir", f.dir);
      if (f.page > 1) params.set("page", String(f.page));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // 서버 재조회 — 1페이지(리셋). append=false.
  const fetchList = useCallback(
    async (f: { q: string; status: string; sort: string; dir: string }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f.q) params.set("q", f.q);
        // 검색어가 완전한 생일이면 birthdate 동반(p_search OR p_birthdate).
        const bd = f.q ? parseFreeBirthdate(f.q) : "";
        if (bd) params.set("birthdate", bd);
        if (f.status) params.set("status", f.status);
        params.set("sort", f.sort);
        params.set("dir", f.dir);
        params.set("limit", String(pageSize));
        params.set("offset", "0");
        const res = await fetch(`/api/clinic/patients?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
          showToast(j?.userMessage || "목록을 불러오지 못했어요", { tone: "danger" });
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { items?: ClinicPatientItem[] };
        const rows = Array.isArray(j?.items) ? j.items : [];
        setItems(rows);
        setPage(1);
        setHasMore(rows.length >= pageSize);
      } catch {
        showToast("네트워크 오류가 발생했어요", { tone: "danger" });
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  // "더 보기" — 다음 페이지 append.
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const bd = q ? parseFreeBirthdate(q) : "";
      if (bd) params.set("birthdate", bd);
      if (status) params.set("status", status);
      params.set("sort", sort);
      params.set("dir", dir);
      params.set("limit", String(pageSize));
      params.set("offset", String((nextPage - 1) * pageSize));
      const res = await fetch(`/api/clinic/patients?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "목록을 불러오지 못했어요", { tone: "danger" });
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { items?: ClinicPatientItem[] };
      const rows = Array.isArray(j?.items) ? j.items : [];
      setItems((prev) => [...prev, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length >= pageSize);
      syncUrl({ q, status, sort, dir, page: nextPage });
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, q, status, sort, dir, pageSize, syncUrl]);

  // 검색 디바운스(300ms). 첫 렌더는 서버 초기 목록 사용 → 스킵.
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      void fetchList({ q: q.trim(), status, sort, dir });
      syncUrl({ q: q.trim(), status, sort, dir, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // status/sort/dir 변경도 같은 재조회 경로를 타되, 즉시성이 필요해 아래 핸들러에서 직접 호출.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 상태 칩·정렬 변경 — 디바운스 없이 즉시 재조회 + URL 동기.
  const applyStatus = (next: string) => {
    setStatus(next);
    void fetchList({ q: q.trim(), status: next, sort, dir });
    syncUrl({ q: q.trim(), status: next, sort, dir, page: 1 });
  };
  const applySort = (col: string, nextDir?: "asc" | "desc") => {
    // 같은 컬럼 재클릭 = 방향 토글, 다른 컬럼 = 그 컬럼 desc(생일·이름은 asc 기본이 자연스러움).
    const d =
      nextDir ??
      (sort === col ? (dir === "asc" ? "desc" : "asc") : defaultDir(col));
    setSort(col);
    setDir(d);
    void fetchList({ q: q.trim(), status, sort: col, dir: d });
    syncUrl({ q: q.trim(), status, sort: col, dir: d, page: 1 });
  };

  const total = items.length;

  return (
    <ClinicShell back="/clinic">
      <section className="w-full py-6">
        {/* 제목 + 부제 + 등록 버튼 — admin 회원관리 헤더 톤. */}
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ink-700)]">환자 관리</h1>
            <p className="mt-1 text-xs text-[var(--ink-300)]">
              총 {total.toLocaleString()}명
              {hasMore ? " 이상" : ""}
            </p>
          </div>
          <Link
            href="/clinic/patients/new"
            className="h-9 shrink-0 rounded-[var(--r-btn)] bg-[var(--tt-blue)] px-4 text-sm font-semibold leading-9 text-white hover:bg-[var(--tt-blue-deep)]"
          >
            + 환자 등록
          </Link>
        </div>

        {/* 통합 검색창 — 이름·등록번호·아이디·생일. admin h-9 톤. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={q}
            autoComplete="off"
            spellCheck={false}
            placeholder="이름·등록번호·아이디·생년월일 검색"
            onChange={(e) => setQ(e.target.value)}
            className="h-9 flex-1 min-w-[160px] rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-sm focus:border-[var(--tt-blue)] focus:outline-none"
          />
          {/* 모바일 정렬 드롭다운(md↓ 노출) — 표 헤더 정렬과 같은 sort 공유. */}
          <select
            value={`${sort}:${dir}`}
            onChange={(e) => {
              const [col, d] = e.target.value.split(":");
              applySort(col, d === "asc" ? "asc" : "desc");
            }}
            className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-sm focus:border-[var(--tt-blue)] focus:outline-none md:hidden"
            aria-label="정렬 기준"
          >
            {SORT_OPTIONS.map((o) => (
              <optgroup key={o.value} label={o.label}>
                <option value={`${o.value}:desc`}>{o.label} ↓</option>
                <option value={`${o.value}:asc`}>{o.label} ↑</option>
              </optgroup>
            ))}
          </select>
        </div>

        {/* 상태 필터 칩 — admin 기간칩 톤. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--ink-300)]">상태</span>
          <div className="flex flex-wrap gap-1">
            {STATUS_CHIPS.map((chip) => {
              const active = chip.value === status;
              return (
                <button
                  key={chip.value || "all"}
                  type="button"
                  onClick={() => applyStatus(chip.value)}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
                    (active
                      ? "bg-[var(--tt-blue-deep)] font-semibold text-white"
                      : "border border-[var(--line)] bg-white text-[var(--ink-500)] hover:border-[var(--tt-blue)] hover:text-[var(--tt-blue)]")
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <PatientsSkeleton />
        ) : items.length === 0 ? (
          <div className="rounded-[var(--r-card)] border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-[var(--ink-300)]">
            {q.trim() || status
              ? "조건에 맞는 환자가 없어요."
              : "아직 등록된 환자가 없어요. ‘환자 등록’에서 추가해보세요."}
          </div>
        ) : (
          <>
            {/* 데스크탑 표(md↑) — 가로스크롤. */}
            <div className="hidden overflow-x-auto rounded-[var(--r-card)] border border-[var(--line)] bg-white shadow-[var(--card-shadow)] md:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-[var(--tt-blue-tint)] text-[var(--ink-500)]">
                  <tr>
                    <SortableTh label="이름" col="patient_name" sort={sort} dir={dir} onSort={applySort} />
                    <th className="px-3 py-2 text-left font-medium">아이디</th>
                    <SortableTh label="생년월일" col="patient_birthdate" sort={sort} dir={dir} onSort={applySort} />
                    <th className="px-2 py-2 text-right font-medium">나이</th>
                    <th className="px-2 py-2 text-center font-medium">성별</th>
                    <th className="px-3 py-2 text-left font-medium">등록번호</th>
                    <SortableTh label="상태" col="status" sort={sort} dir={dir} onSort={applySort} />
                    <SortableTh label="등록일" col="created_at" sort={sort} dir={dir} onSort={applySort} />
                    <SortableTh label="최근 시술일" col="last_visit_on" sort={sort} dir={dir} onSort={applySort} />
                    <SortableTh label="시술 수" col="visit_count" sort={sort} dir={dir} onSort={applySort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.link_id}
                      onClick={() => router.push(`/clinic/patients/${it.link_id}`)}
                      className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--tt-blue-tint)]"
                    >
                      <td className="px-3 py-2 align-middle font-medium text-[var(--ink-700)]">
                        {it.patient_name || it.member_handle || "이름 미입력"}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-[var(--ink-300)]">
                        {it.member_handle ? `@${it.member_handle}` : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle tabular-nums text-[var(--ink-500)]">
                        {fmtYmd(it.patient_birthdate)}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums text-[var(--ink-500)]">
                        {it.age_years == null ? "—" : it.age_years}
                      </td>
                      <td className="px-2 py-2 align-middle text-center text-[var(--ink-500)]">
                        {genderLabel(it.patient_skin_profile)}
                      </td>
                      <td className="px-3 py-2 align-middle tabular-nums text-[var(--ink-500)]">
                        {it.registration_number || "—"}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-3 py-2 align-middle tabular-nums text-xs text-[var(--ink-300)]">
                        {fmtYmd(it.created_at)}
                      </td>
                      <td className="px-3 py-2 align-middle tabular-nums text-xs text-[var(--ink-300)]">
                        {fmtYmd(it.last_visit_on)}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--ink-500)]">
                        {it.visit_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드(md↓). */}
            <div className="space-y-2 md:hidden">
              {items.map((it) => (
                <Link
                  key={it.link_id}
                  href={`/clinic/patients/${it.link_id}`}
                  className="block rounded-[var(--r-card)] border border-[var(--line)] bg-white p-4 transition-colors hover:bg-[var(--tt-blue-tint)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-[var(--ink-700)]">
                        {it.patient_name || it.member_handle || "이름 미입력"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--ink-300)]">
                        {it.member_handle ? `@${it.member_handle}` : "아이디 없음"}
                      </div>
                    </div>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-500)]">
                    <span className="tabular-nums">{fmtYmd(it.patient_birthdate)}</span>
                    <span>{it.age_years == null ? "나이 —" : `만 ${it.age_years}세`}</span>
                    <span>{genderLabel(it.patient_skin_profile)}</span>
                    {it.registration_number && (
                      <span className="tabular-nums">{it.registration_number}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--tt-blue-tint)] px-2 py-0.5 text-[11px] text-[var(--ink-500)]">
                      최근 {fmtYmd(it.last_visit_on)}
                    </span>
                    <span className="rounded-full bg-[var(--tt-blue-tint)] px-2 py-0.5 text-[11px] text-[var(--ink-500)]">
                      시술 {it.visit_count.toLocaleString()}건
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* 더 보기(offset+pageSize). */}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-5 text-sm font-medium text-[var(--ink-500)] hover:border-[var(--tt-blue)] hover:text-[var(--tt-blue)] disabled:opacity-60"
                >
                  {loadingMore ? "불러오는 중…" : "더 보기"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </ClinicShell>
  );
}

/** 다른 컬럼으로 처음 정렬할 때의 기본 방향 — 이름·생일은 오름차순이 자연스럽다. */
function defaultDir(col: string): "asc" | "desc" {
  return col === "patient_name" || col === "patient_birthdate" ? "asc" : "desc";
}

/** 정렬 가능한 표 헤더 — 클릭 시 방향 토글, 활성 컬럼에 ▲▼. */
function SortableTh({
  label,
  col,
  sort,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  col: string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (col: string) => void;
  align?: "left" | "right";
}) {
  const active = sort === col;
  const arrow = active ? (dir === "asc" ? "▲" : "▼") : "";
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={
          "inline-flex items-center gap-1 transition-colors hover:text-[var(--tt-blue)] " +
          (active ? "font-semibold text-[var(--ink-700)]" : "")
        }
      >
        {label}
        {arrow && <span className="text-[10px] text-[var(--tt-blue-deep)]">{arrow}</span>}
      </button>
    </th>
  );
}

/** 로딩 스켈레톤 — 표/카드 공통(간단 회색 바). */
function PatientsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--tt-blue-tint)]/40"
        />
      ))}
    </div>
  );
}
