"use client";

/**
 * ClinicVisitsView — /clinic/visits 시술기록 관리(지점 전체 대장, S4 · 계획 §2.5·C7·C13).
 *
 * 관리자 회원관리(/admin/users)와 동일한 톤·패턴(C10). 색은 admin 토큰만
 *   (--ink / --tt-blue / --line 계열). --primary·--text 미사용.
 *
 * 2뷰(?view=list|calendar):
 *   ⓐ 목록 뷰 — admin 표(md↑ 가로스크롤 / md↓ 카드). 방문일·환자·시술·원장·금액·다음예약.
 *      행 클릭 → 편집(/clinic/patients/[link_id]/visits/[diary_id]/edit). 정렬 헤더(방문일·환자·금액).
 *      원장 필터 드롭다운 · 검색(환자·시술) · 더 보기(offset). 기본 방문일 최신순(C13).
 *   ⓑ 캘린더 뷰 — 월 그리드. 날짜 셀에 기록 수. 날짜 클릭 → 그 하루(from=to=날짜)로 목록 전환.
 *
 * 기간 선택 3방식(모두 from~to 로 통일, URL ?from=&to=):
 *   1) 빠른 버튼 [오늘][한 주][한 달][전체]
 *   2) 년·월 바로가기 [YYYY년▾][M월▾] — 그 달 1일~말일 + 캘린더도 그 달로.
 *   3) 직접 범위 지정 date input 2개.
 *
 * 서버(page.tsx)가 초기 목록·필터·원장 목록을 주고, 이후 변경은 GET /api/clinic/visits 재조회.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { ClinicShell, kstToday, fmtYmd, fmtPrice, type ClinicDoctorOption } from "../_shared";

/** get_clinic_visits(0350) 1행 = 지점 시술기록 대장 항목. */
export type ClinicVisitListItem = {
  diary_id: number;
  visited_on: string | null;
  link_id: number;
  patient_name: string | null;
  member_handle: string | null;
  doctor_name: string | null;
  total_price: number | null;
  next_appointment_date: string | null;
  procedures_summary: string | null;
};

export type VisitsFilters = {
  view: "list" | "calendar" | string;
  from: string;
  to: string;
  q: string;
  doctor: string;
  sort: string;
  dir: "asc" | "desc" | string;
  page: number;
};

/** get_clinic_calendar_summary(0350) 1행. */
type CalendarDay = { visit_date: string; visit_count: number };

// 정렬 가능 컬럼 — 라벨은 헤더/드롭다운 공용. RPC 화이트리스트와 동일.
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "visited_on", label: "방문일" },
  { value: "patient_name", label: "환자" },
  { value: "total_price", label: "금액" },
];
const SORTABLE = new Set(SORT_OPTIONS.map((o) => o.value));

/* ── 날짜 유틸 (KST 기준 · 문자열 YYYY-MM-DD 중심).
 *    kstToday·fmtYmd·fmtPrice 는 _shared 공용(SSOT). 아래는 이 뷰의 캘린더·기간 전용 파생. ── */

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** 그 달 말일. */
function lastDay(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** 이번 주(월~일) "YYYY-MM-DD" 범위 — KST 오늘 기준. */
function weekRange(): { from: string; to: string } {
  const t = kstToday();
  const base = new Date(Date.UTC(t.y, t.m - 1, t.d));
  const dow = base.getUTCDay(); // 0=일 … 6=토
  const diffToMon = dow === 0 ? -6 : 1 - dow; // 월요일까지 offset
  const mon = new Date(base);
  mon.setUTCDate(base.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    from: ymd(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate()),
    to: ymd(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate()),
  };
}
/** 그 달 1일~말일 범위. */
function monthRange(y: number, m: number): { from: string; to: string } {
  return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
}

// 월 옵션(1~12)은 고정이라 모듈 레벨 상수. 연도 옵션은 kstToday() 파생이라 연말 경계 stale 방지를
//   위해 컴포넌트 내부에서 런타임 계산한다(모듈 레벨 상수 금지).
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function ClinicVisitsView({
  initialVisits,
  initialFilters,
  doctors,
  pageSize,
}: {
  initialVisits: ClinicVisitListItem[];
  initialFilters: VisitsFilters;
  doctors: ClinicDoctorOption[];
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 년 바로가기 드롭다운 옵션 — 최근 6년. kstToday() 파생이라 마운트 시 런타임 계산(연말 경계 stale 방지).
  const YEAR_OPTIONS = useMemo(() => {
    const nowYear = kstToday().y;
    return Array.from({ length: 6 }, (_, i) => nowYear - i);
  }, []);

  const [view, setView] = useState<"list" | "calendar">(
    initialFilters.view === "calendar" ? "calendar" : "list",
  );
  const [items, setItems] = useState<ClinicVisitListItem[]>(initialVisits);
  const [q, setQ] = useState(initialFilters.q);
  const [doctor, setDoctor] = useState(initialFilters.doctor);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [sort, setSort] = useState(
    SORTABLE.has(initialFilters.sort) ? initialFilters.sort : "visited_on",
  );
  const [dir, setDir] = useState<"asc" | "desc">(initialFilters.dir === "asc" ? "asc" : "desc");
  const [page, setPage] = useState(initialFilters.page > 0 ? initialFilters.page : 1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialVisits.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);

  // 캘린더 현재 표시 년·월 — 기간(from)이 있으면 그 달, 없으면 KST 이번 달.
  const initMonth = (() => {
    const m = /^(\d{4})-(\d{2})/.exec(from);
    if (m) return { y: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    const t = kstToday();
    return { y: t.y, m: t.m };
  })();
  const [calYear, setCalYear] = useState(initMonth.y);
  const [calMonth, setCalMonth] = useState(initMonth.m);

  // URL 동기 — 현재 필터를 searchParams 로.
  const syncUrl = useCallback(
    (f: {
      view: string;
      from: string;
      to: string;
      q: string;
      doctor: string;
      sort: string;
      dir: string;
      page: number;
    }) => {
      const params = new URLSearchParams();
      if (f.view === "calendar") params.set("view", "calendar");
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
      if (f.q) params.set("q", f.q);
      if (f.doctor) params.set("doctor", f.doctor);
      if (f.sort && f.sort !== "visited_on") params.set("sort", f.sort);
      if (f.dir && f.dir !== "desc") params.set("dir", f.dir);
      if (f.page > 1) params.set("page", String(f.page));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** 목록 서버 재조회(1페이지 리셋). */
  const fetchList = useCallback(
    async (f: { q: string; doctor: string; from: string; to: string; sort: string; dir: string }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f.q) params.set("q", f.q);
        if (f.doctor) params.set("doctor_id", f.doctor);
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        params.set("sort", f.sort);
        params.set("dir", f.dir);
        params.set("limit", String(pageSize));
        params.set("offset", "0");
        const res = await fetch(`/api/clinic/visits?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
          showToast(j?.userMessage || "목록을 불러오지 못했어요", { tone: "danger" });
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { items?: ClinicVisitListItem[] };
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

  /** "더 보기" — 다음 페이지 append. */
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (doctor) params.set("doctor_id", doctor);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("sort", sort);
      params.set("dir", dir);
      params.set("limit", String(pageSize));
      params.set("offset", String((nextPage - 1) * pageSize));
      const res = await fetch(`/api/clinic/visits?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { userMessage?: string };
        showToast(j?.userMessage || "목록을 불러오지 못했어요", { tone: "danger" });
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { items?: ClinicVisitListItem[] };
      const rows = Array.isArray(j?.items) ? j.items : [];
      setItems((prev) => [...prev, ...rows]);
      setPage(nextPage);
      setHasMore(rows.length >= pageSize);
      syncUrl({ view, from, to, q, doctor, sort, dir, page: nextPage });
    } catch {
      showToast("네트워크 오류가 발생했어요", { tone: "danger" });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, q, doctor, from, to, sort, dir, pageSize, view, syncUrl]);

  // 검색 디바운스(300ms). 첫 렌더는 서버 초기 목록 사용 → 스킵.
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      void fetchList({ q: q.trim(), doctor, from, to, sort, dir });
      syncUrl({ view, from, to, q: q.trim(), doctor, sort, dir, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /** 기간 즉시 적용(빠른버튼·년월·직접범위·캘린더 클릭 공용). 목록 재조회 + URL 동기 + 목록 뷰 유지. */
  const applyRange = useCallback(
    (nextFrom: string, nextTo: string, opts?: { toList?: boolean }) => {
      setFrom(nextFrom);
      setTo(nextTo);
      const nextView = opts?.toList ? "list" : view;
      if (opts?.toList) setView("list");
      void fetchList({ q: q.trim(), doctor, from: nextFrom, to: nextTo, sort, dir });
      syncUrl({ view: nextView, from: nextFrom, to: nextTo, q: q.trim(), doctor, sort, dir, page: 1 });
    },
    [view, q, doctor, sort, dir, fetchList, syncUrl],
  );

  const applyDoctor = (next: string) => {
    setDoctor(next);
    void fetchList({ q: q.trim(), doctor: next, from, to, sort, dir });
    syncUrl({ view, from, to, q: q.trim(), doctor: next, sort, dir, page: 1 });
  };

  const applySort = (col: string, nextDir?: "asc" | "desc") => {
    const d = nextDir ?? (sort === col ? (dir === "asc" ? "desc" : "asc") : defaultDir(col));
    setSort(col);
    setDir(d);
    void fetchList({ q: q.trim(), doctor, from, to, sort: col, dir: d });
    syncUrl({ view, from, to, q: q.trim(), doctor, sort: col, dir: d, page: 1 });
  };

  const switchView = (next: "list" | "calendar") => {
    setView(next);
    syncUrl({ view: next, from, to, q: q.trim(), doctor, sort, dir, page });
  };

  /* ── 빠른 버튼 ── */
  const quickButtons: { key: string; label: string; run: () => void }[] = [
    {
      key: "today",
      label: "오늘",
      run: () => {
        const t = kstToday();
        applyRange(ymd(t.y, t.m, t.d), ymd(t.y, t.m, t.d), { toList: true });
      },
    },
    {
      key: "week",
      label: "한 주",
      run: () => {
        const r = weekRange();
        applyRange(r.from, r.to, { toList: true });
      },
    },
    {
      key: "month",
      label: "한 달",
      run: () => {
        const t = kstToday();
        const r = monthRange(t.y, t.m);
        setCalYear(t.y);
        setCalMonth(t.m);
        applyRange(r.from, r.to);
      },
    },
    {
      key: "all",
      label: "전체",
      run: () => applyRange("", "", { toList: true }),
    },
  ];

  /** 현재 from~to 가 어느 빠른버튼과 일치하는지(활성 표시용). */
  const activeQuick = (() => {
    if (!from && !to) return "all";
    const t = kstToday();
    if (from === ymd(t.y, t.m, t.d) && to === from) return "today";
    const w = weekRange();
    if (from === w.from && to === w.to) return "week";
    const mo = monthRange(t.y, t.m);
    if (from === mo.from && to === mo.to) return "month";
    return "";
  })();

  /** 년·월 드롭다운 변경 → 그 달로 점프(+캘린더 동기). */
  const jumpToMonth = (y: number, m: number) => {
    setCalYear(y);
    setCalMonth(m);
    const r = monthRange(y, m);
    applyRange(r.from, r.to);
  };

  const rangeLabel =
    !from && !to ? "전체 기간" : `${fmtYmd(from || null)} ~ ${fmtYmd(to || null)}`;

  return (
    <ClinicShell back="/clinic">
      <section className="w-full py-6">
        {/* 제목 + 뷰 토글 */}
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ink-700)]">시술기록 관리</h1>
            <p className="mt-1 text-xs text-[var(--ink-300)]">{rangeLabel}</p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-[var(--r-btn)] border border-[var(--line)]">
            {(["list", "calendar"] as const).map((v) => {
              const on = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => switchView(v)}
                  className={
                    "h-9 px-4 text-sm font-semibold transition-colors " +
                    (on
                      ? "bg-[var(--tt-blue-deep)] text-white"
                      : "bg-white text-[var(--ink-500)] hover:text-[var(--tt-blue)]")
                  }
                >
                  {v === "list" ? "목록" : "캘린더"}
                </button>
              );
            })}
          </div>
        </div>

        {/* 기간 선택 3방식 */}
        <div className="mb-4 space-y-2.5">
          {/* 1) 빠른 버튼 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--ink-300)]">기간</span>
            <div className="flex flex-wrap gap-1">
              {quickButtons.map((b) => {
                const on = activeQuick === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={b.run}
                    className={
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                      (on
                        ? "bg-[var(--tt-blue-deep)] font-semibold text-white"
                        : "border border-[var(--line)] bg-white text-[var(--ink-500)] hover:border-[var(--tt-blue)] hover:text-[var(--tt-blue)]")
                    }
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2) 년·월 바로가기 + 3) 직접 범위 지정 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={calYear}
              onChange={(e) => jumpToMonth(parseInt(e.target.value, 10), calMonth)}
              className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-2 text-sm focus:border-[var(--tt-blue)] focus:outline-none"
              aria-label="연도 바로가기"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              value={calMonth}
              onChange={(e) => jumpToMonth(calYear, parseInt(e.target.value, 10))}
              className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-2 text-sm focus:border-[var(--tt-blue)] focus:outline-none"
              aria-label="월 바로가기"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>

            <span className="mx-1 hidden text-[var(--ink-300)] sm:inline">|</span>

            {/* 직접 범위 지정 — 한쪽만 입력된 상태에선 조회하지 않고 그 칸만 갱신(R2경고 완화:
                예전엔 시작일만 골라도 즉시 하루로 강제 조회됐음). 반대쪽이 이미 있으면 즉시 조회. */}
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => (to ? applyRange(e.target.value, to) : setFrom(e.target.value))}
              className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-2 text-sm text-[var(--ink-700)] focus:border-[var(--tt-blue)] focus:outline-none"
              aria-label="시작일"
            />
            <span className="text-[var(--ink-300)]">~</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => (from ? applyRange(from, e.target.value) : setTo(e.target.value))}
              className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-2 text-sm text-[var(--ink-700)] focus:border-[var(--tt-blue)] focus:outline-none"
              aria-label="종료일"
            />
          </div>
        </div>

        {view === "list" ? (
          <>
            {/* 검색 + 원장 필터 */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={q}
                autoComplete="off"
                spellCheck={false}
                placeholder="환자·시술 검색"
                onChange={(e) => setQ(e.target.value)}
                className="h-9 flex-1 min-w-[160px] rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-sm focus:border-[var(--tt-blue)] focus:outline-none"
              />
              <select
                value={doctor}
                onChange={(e) => applyDoctor(e.target.value)}
                className="h-9 rounded-[var(--r-btn)] border border-[var(--line)] bg-white px-3 text-sm focus:border-[var(--tt-blue)] focus:outline-none"
                aria-label="원장 필터"
              >
                <option value="">전체 원장</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} 원장
                  </option>
                ))}
              </select>
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

            {loading ? (
              <VisitsSkeleton />
            ) : items.length === 0 ? (
              <div className="rounded-[var(--r-card)] border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-[var(--ink-300)]">
                {q.trim() || doctor
                  ? "조건에 맞는 시술기록이 없어요."
                  : "선택한 기간에 시술기록이 없어요."}
              </div>
            ) : (
              <>
                {/* 데스크탑 표(md↑) — 가로스크롤. */}
                <div className="hidden overflow-x-auto rounded-[var(--r-card)] border border-[var(--line)] bg-white shadow-[var(--card-shadow)] md:block">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead className="bg-[var(--tt-blue-tint)] text-[var(--ink-500)]">
                      <tr>
                        <SortableTh label="방문일" col="visited_on" sort={sort} dir={dir} onSort={applySort} />
                        <SortableTh label="환자" col="patient_name" sort={sort} dir={dir} onSort={applySort} />
                        <th className="px-3 py-2 text-left font-medium">시술</th>
                        <th className="px-3 py-2 text-left font-medium">원장</th>
                        <SortableTh label="금액" col="total_price" sort={sort} dir={dir} onSort={applySort} align="right" />
                        <th className="px-3 py-2 text-left font-medium">다음예약</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr
                          key={it.diary_id}
                          onClick={() =>
                            router.push(`/clinic/patients/${it.link_id}/visits/${it.diary_id}/edit`)
                          }
                          className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--tt-blue-tint)]"
                        >
                          <td className="px-3 py-2 align-middle tabular-nums font-semibold text-[var(--tt-blue-deep)]">
                            {fmtYmd(it.visited_on)}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <Link
                              href={`/clinic/patients/${it.link_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-[var(--ink-700)] hover:text-[var(--tt-blue)] hover:underline"
                            >
                              {it.patient_name || it.member_handle || "이름 미입력"}
                            </Link>
                          </td>
                          <td className="max-w-[240px] truncate px-3 py-2 align-middle text-[var(--ink-500)]">
                            {it.procedures_summary || "시술 기록"}
                          </td>
                          <td className="px-3 py-2 align-middle text-[var(--ink-500)]">
                            {it.doctor_name ? `${it.doctor_name} 원장` : "—"}
                          </td>
                          <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--ink-500)]">
                            {fmtPrice(it.total_price) ?? "—"}
                          </td>
                          <td className="px-3 py-2 align-middle tabular-nums text-xs text-[var(--ink-300)]">
                            {fmtYmd(it.next_appointment_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 모바일 카드(md↓) — 행 전체 편집 링크. */}
                <div className="space-y-2 md:hidden">
                  {items.map((it) => (
                    <Link
                      key={it.diary_id}
                      href={`/clinic/patients/${it.link_id}/visits/${it.diary_id}/edit`}
                      className="block rounded-[var(--r-card)] border border-[var(--line)] bg-white p-4 transition-colors hover:bg-[var(--tt-blue-tint)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular-nums text-[13px] font-bold text-[var(--tt-blue-deep)]">
                          {fmtYmd(it.visited_on)}
                        </span>
                        {fmtYmd(it.next_appointment_date) !== "—" && (
                          <span className="shrink-0 rounded-full bg-[var(--tt-blue-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tt-blue-deep)]">
                            다음 {fmtYmd(it.next_appointment_date)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[14px] font-semibold text-[var(--ink-900)]">
                        {it.procedures_summary || "시술 기록"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[var(--ink-500)]">
                        <span>{it.patient_name || it.member_handle || "이름 미입력"}</span>
                        {it.doctor_name && <span className="text-[var(--ink-300)]">·</span>}
                        {it.doctor_name && <span>{it.doctor_name} 원장</span>}
                        {fmtPrice(it.total_price) && <span className="text-[var(--ink-300)]">·</span>}
                        {fmtPrice(it.total_price) && (
                          <span className="tabular-nums">{fmtPrice(it.total_price)}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>

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
          </>
        ) : (
          <CalendarView
            year={calYear}
            month={calMonth}
            onMonth={(y, m) => {
              // ◀▶ 월 이동 = 캘린더 탐색 전용. 목록 조회 기간(from~to)은 바꾸지 않는다(의도된 비동기).
              //   목록에 반영하려면 상단 년·월 드롭다운(jumpToMonth) 또는 날짜 셀 클릭(onPickDay)을 쓴다.
              setCalYear(y);
              setCalMonth(m);
            }}
            // 날짜 셀 클릭 = 그 하루(from=to=날짜)로 목록 필터 + 목록 뷰 전환.
            onPickDay={(dateStr) => applyRange(dateStr, dateStr, { toList: true })}
          />
        )}
      </section>
    </ClinicShell>
  );
}

/** 다른 컬럼으로 처음 정렬할 때의 기본 방향 — 환자명은 오름차순이 자연스럽다. */
function defaultDir(col: string): "asc" | "desc" {
  return col === "patient_name" ? "asc" : "desc";
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

/** 로딩 스켈레톤. */
function VisitsSkeleton() {
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

/**
 * CalendarView — 월간 그리드. get_clinic_calendar_summary(0350)로 날짜별 기록 수를 셀에 표시.
 *   ◀▶ 로 월 이동(+ 상위 년·월 드롭다운과 연동). 날짜 클릭 → onPickDay(그 하루 목록 전환).
 *   당월 외 날짜는 흐리게(전월·익월 채움). 요일 헤더 · 주 단위 6줄 고정 그리드.
 */
function CalendarView({
  year,
  month,
  onMonth,
  onPickDay,
}: {
  year: number;
  month: number;
  onMonth: (y: number, m: number) => void;
  onPickDay: (dateStr: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/clinic/visits/calendar?year=${year}&month=${month}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setCounts({});
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { days?: CalendarDay[] };
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const d of j.days ?? []) {
          const key = typeof d.visit_date === "string" ? d.visit_date.slice(0, 10) : "";
          if (key) map[key] = Number(d.visit_count) || 0;
        }
        setCounts(map);
      } catch {
        if (!cancelled) setCounts({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // 6주 × 7일 그리드(월요일 시작) — 전월·익월 채움.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = first.getUTCDay(); // 0=일 … 6=토
  const leadMon = firstDow === 0 ? 6 : firstDow - 1; // 월요일 시작 offset
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - leadMon);

  const cells: { y: number; m: number; d: number; inMonth: boolean; key: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setUTCDate(gridStart.getUTCDate() + i);
    const cy = cur.getUTCFullYear();
    const cm = cur.getUTCMonth() + 1;
    const cd = cur.getUTCDate();
    cells.push({ y: cy, m: cm, d: cd, inMonth: cm === month && cy === year, key: ymd(cy, cm, cd) });
  }

  const today = ymd(kstToday().y, kstToday().m, kstToday().d);

  const prevMonth = () => (month === 1 ? onMonth(year - 1, 12) : onMonth(year, month - 1));
  const nextMonth = () => (month === 12 ? onMonth(year + 1, 1) : onMonth(year, month + 1));

  const totalInMonth = cells
    .filter((c) => c.inMonth)
    .reduce((sum, c) => sum + (counts[c.key] ?? 0), 0);

  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-white p-4 shadow-[var(--card-shadow)]">
      {/* 월 네비게이션 */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="이전 달"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--r-btn)] border border-[var(--line)] text-[var(--ink-500)] hover:border-[var(--tt-blue)] hover:text-[var(--tt-blue)]"
        >
          ◀
        </button>
        <div className="text-center">
          <div className="text-[15px] font-bold text-[var(--ink-700)]">
            {year}년 {month}월
          </div>
          <div className="text-[11px] text-[var(--ink-300)]">
            {loading ? "불러오는 중…" : `이 달 ${totalInMonth.toLocaleString()}건`}
          </div>
        </div>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="다음 달"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--r-btn)] border border-[var(--line)] text-[var(--ink-500)] hover:border-[var(--tt-blue)] hover:text-[var(--tt-blue)]"
        >
          ▶
        </button>
      </div>

      {/* 요일 헤더 (월~일) */}
      <div className="grid grid-cols-7 gap-1">
        {["월", "화", "수", "목", "금", "토", "일"].map((w, i) => (
          <div
            key={w}
            className={
              "pb-1 text-center text-[11px] font-semibold " +
              (i === 6 ? "text-red-500" : "text-[var(--ink-300)]")
            }
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const count = counts[c.key] ?? 0;
          const isToday = c.key === today;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onPickDay(c.key)}
              className={
                "relative flex aspect-square flex-col items-center justify-start rounded-[var(--r-btn)] border p-1 text-left transition-colors " +
                (c.inMonth
                  ? "border-[var(--line)] bg-white hover:border-[var(--tt-blue)] hover:bg-[var(--tt-blue-tint)]"
                  : "border-transparent bg-transparent text-[var(--ink-300)] opacity-45 hover:opacity-70") +
                (isToday ? " ring-1 ring-[var(--tt-blue)]" : "")
              }
            >
              <span
                className={
                  "text-[12px] tabular-nums " +
                  (c.inMonth ? "text-[var(--ink-700)]" : "text-[var(--ink-300)]") +
                  (isToday ? " font-bold text-[var(--tt-blue-deep)]" : "")
                }
              >
                {c.d}
              </span>
              {count > 0 && (
                <span className="mt-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--tt-blue-deep)] px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-[var(--ink-300)]">
        날짜를 클릭하면 그날의 시술기록을 목록으로 볼 수 있어요.
      </p>
    </div>
  );
}
