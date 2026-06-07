import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BackButton from "@/components/BackButton";
import TagAdminTable, { type TagRow } from "./TagAdminTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "태그 관리",
  robots: { index: false, follow: false },
};

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정"] as const;
const PERIODS: { label: string; days: number }[] = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];
const PAGE_SIZE = 100;

type Props = {
  searchParams: Promise<{
    cat?: string;
    status?: string;
    q?: string;
    days?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
};

type SortCol =
  | "usage"
  | "search"
  | "created"
  | "onb_name"
  | "parent_name"
  | "ko_name"
  | "cat_name"
  | "en_name";
const TEXT_SORTS: SortCol[] = ["onb_name", "parent_name", "ko_name", "cat_name", "en_name"];

function chip(active: boolean) {
  return (
    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
    (active
      ? "bg-[var(--primary-active)] font-semibold text-white"
      : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]")
  );
}

function qs(base: Record<string, string | undefined>, override: Record<string, string | undefined>) {
  const merged = { ...base, ...override };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "" && v !== null) p.set(k, v);
  }
  const s = p.toString();
  return s ? `/admin/tags?${s}` : "/admin/tags";
}

export default async function AdminTagsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/tags", { superAdminOnly: true });
  const sp = await searchParams;
  const cat = sp.cat ?? "all";
  const status = sp.status ?? "all";
  const q = (sp.q ?? "").trim();
  const days = Number.parseInt(sp.days ?? "0", 10) || 0;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const ALL_SORTS: SortCol[] = ["usage", "search", "created", "onb_name", "parent_name", "ko_name", "cat_name", "en_name"];
  let sortCol: SortCol = ALL_SORTS.includes(sp.sort as SortCol) ? (sp.sort as SortCol) : "usage";
  let sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  // '새 태그' = 생성일 최근순 강제 (D5 — 상태칩 배타 단일선택)
  if (status === "new") {
    sortCol = "created";
    sortDir = "desc";
  }

  const supabase = await createSupabaseServerClient();
  // Supabase 응답 행 상한이 1000 이라 단일 호출로는 전체 태그(>1000)를 못 받음.
  // → range 청크로 전체 수신(카운터·목록 모두 전체 모수 기준). RPC 는 ORDER BY usage DESC, ko ASC 로 결정적.
  const allRows: TagRow[] = await (async () => {
    const PAGE = 1000;
    const acc: TagRow[] = [];
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase
        .rpc("get_tag_admin_overview", { p_days: days })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      acc.push(...(data as TagRow[]));
      if (data.length < PAGE) break;
    }
    return acc;
  })();

  // 요약 수치 + 분류 칩 카운트 — tag_dictionary 직접 count(head:true). 행 상한(1000) 무관,
  // 전체 모수 기준 항상 정확(allRows.length 집계 폐기 — 자동등록으로 행이 늘어도 견고).
  const [allC, enNullC, procC, ...catCs] = await Promise.all([
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }),
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).is("en", null),
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).eq("is_procedure", true),
    ...CATEGORIES.map((c) =>
      supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).eq("category", c),
    ),
  ]);
  const total = allC.count ?? 0;
  const enBlank = enNullC.count ?? 0;
  const procCount = procC.count ?? 0;
  const catCounts: Record<string, number> = { all: total };
  CATEGORIES.forEach((c, i) => {
    catCounts[c] = catCs[i]?.count ?? 0;
  });
  const unspec = catCounts["미지정"] ?? 0;
  const classified = total - unspec;

  // 필터 (분류 → 상태 → 검색)
  let rows = allRows;
  if (cat !== "all") rows = rows.filter((r) => r.category === cat);
  if (status === "en_blank") rows = rows.filter((r) => !r.en);
  else if (status === "unspec") rows = rows.filter((r) => r.category === "미지정");
  else if (status === "classified") rows = rows.filter((r) => r.category !== "미지정");
  else if (status === "proc") rows = rows.filter((r) => r.is_procedure);
  else if (status === "rec") rows = rows.filter((r) => r.is_recommendable);
  else if (status === "onb") rows = rows.filter((r) => !!r.onboarding);
  else if (status === "parent") rows = rows.filter((r) => !!r.parent_ko);
  else if (status === "eng") rows = rows.filter((r) => /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(r.ko)); // G2: ko 가 영문(한글 미포함)
  if (q) rows = rows.filter((r) => r.ko.includes(q));

  // 정렬 (헤더 클릭 / '새 태그' 칩) — 숫자 컬럼 vs 텍스트(가나다/알파벳) 컬럼 분기. 기본 사용량 내림차순.
  if (TEXT_SORTS.includes(sortCol)) {
    const textOf = (r: TagRow): string =>
      sortCol === "onb_name"
        ? (r.onboarding ?? "")
        : sortCol === "parent_name"
          ? (r.parent_ko ?? "")
          : sortCol === "cat_name"
            ? r.category
            : sortCol === "en_name"
              ? (r.en ?? "")
              : r.ko;
    // G3: 정렬 시 공란(빈 값) 행은 방향과 무관하게 항상 맨 아래로 모음.
    rows = [...rows].sort((a, b) => {
      const ta = textOf(a);
      const tb = textOf(b);
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      const d = ta.localeCompare(tb, "ko");
      return sortDir === "asc" ? d : -d;
    });
  } else {
    const keyOf = (r: TagRow): number =>
      sortCol === "search"
        ? r.search_cnt
        : sortCol === "created"
          ? new Date(r.first_card_at ?? r.created_at).getTime()
          : r.usage;
    rows = [...rows].sort((a, b) => {
      const d = keyOf(a) - keyOf(b);
      return sortDir === "asc" ? d : -d;
    });
  }

  const filteredCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(pageNum, totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const base = {
    cat: sp.cat,
    status: sp.status,
    q: sp.q,
    days: sp.days,
    sort: sp.sort,
    dir: sp.dir,
  };
  // 부모 autocomplete + 검증용 전체 태그 ko (전 페이지 기준)
  const allKo = allRows.map((r) => r.ko);

  return (
    // 공통 컨테이너(app/layout main: mx-auto max-w-1080 px-4)를 그대로 채움 — 다른 admin 화면과 동일(J).
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">태그 관리</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          tag_dictionary SSOT · 편집 즉시 / 사이트 색상은 다음 배포 반영
        </p>
      </div>

      {/* 요약 카드 — 4개(데스크탑 한 줄·모바일 2×2). '미지정'은 상태 칩으로 접근. */}
      {/* KPI 카드 클릭 = 해당 조건 필터 (대시보드 통계 카드 패턴). 클릭 시 분류 해제·스크롤 유지. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          { label: "전체", v: total, status: undefined },
          { label: "분류완료", v: classified, status: "classified" },
          { label: "영문 공란", v: enBlank, status: "en_blank" },
          { label: "시술 후기", v: procCount, status: "proc" },
        ] as const).map((s) => {
          const active = cat === "all" && status === (s.status ?? "all");
          return (
            <Link
              replace
              scroll={false}
              key={s.label}
              href={qs(base, { cat: undefined, status: s.status, sort: undefined, dir: undefined, page: undefined })}
              className={
                "block rounded-[var(--radius)] border bg-white p-3 transition-colors " +
                (active
                  ? "border-[var(--primary)]"
                  : "border-[var(--border)] hover:bg-[var(--bg-soft)]")
              }
            >
              <div className="text-[11px] text-[var(--text-muted)]">{s.label}</div>
              <div className="text-lg font-bold tabular-nums text-[var(--text)]">{s.v.toLocaleString()}</div>
            </Link>
          );
        })}
      </div>

      {/* 분류 탭 — 단일선택 배타 + 활성 재클릭 시 해제(전체) (D5). 필터 변경은 replace. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link replace scroll={false} href={qs(base,{ cat: undefined, page: undefined })} className={chip(cat === "all")}>
          전체 <span className="text-[10px] opacity-70">{catCounts.all.toLocaleString()}</span>
        </Link>
        {CATEGORIES.map((c) => (
          <Link replace scroll={false} key={c} href={qs(base, { cat: cat === c ? undefined : c, page: undefined })} className={chip(cat === c)}>
            {c} <span className="text-[10px] opacity-70">{(catCounts[c] ?? 0).toLocaleString()}</span>
          </Link>
        ))}
      </div>

      {/* 상태 칩(좌) + 기간 칩(우). 모바일: 각 줄 세로 stack(어긋남 방지) / 데스크탑: 한 줄 좌우. (K3) */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">상태</span>
          <Link replace scroll={false} href={qs(base,{ status: undefined, sort: undefined, dir: undefined, page: undefined })} className={chip(status === "all")}>전체</Link>
          {([
            ["en_blank", "영문 공란"],
            ["unspec", "미지정"],
            ["proc", "시술 후기"],
            ["onb", "온보딩"],
            ["eng", "영문 태그"],
            ["new", "새 태그"],
          ] as const).map(([key, label]) => {
            const active = status === key;
            // 활성 재클릭 → 해제(전체). 선택 시 이전 정렬 잔재 제거(sort/dir 초기화)로 배타 보장.
            const href = active
              ? qs(base, { status: undefined, sort: undefined, dir: undefined, page: undefined })
              : qs(base, { status: key, sort: undefined, dir: undefined, page: undefined });
            return (
              <Link replace scroll={false} key={key} href={href} className={chip(active)}>
                {label}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <span className="text-[11px] text-[var(--text-muted)]">기간</span>
          {PERIODS.map((p) => (
            <Link replace scroll={false} key={p.days} href={qs(base, { days: p.days === 0 ? undefined : String(p.days), page: undefined })} className={chip(days === p.days)}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 검색 */}
      <form action="/admin/tags" method="get" className="mb-3 flex items-center gap-2">
        {sp.cat ? <input type="hidden" name="cat" value={sp.cat} /> : null}
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        {sp.days ? <input type="hidden" name="days" value={sp.days} /> : null}
        {sp.sort ? <input type="hidden" name="sort" value={sp.sort} /> : null}
        {sp.dir ? <input type="hidden" name="dir" value={sp.dir} /> : null}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="태그(한글) 검색"
          className="h-9 flex-1 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white">
          검색
        </button>
      </form>

      <p className="mb-2 text-xs text-[var(--text-muted)]">
        {filteredCount.toLocaleString()}개 ·{" "}
        {sortCol === "search"
          ? "검색량"
          : sortCol === "created"
            ? "생성일"
            : sortCol === "onb_name"
              ? "온보딩 가나다"
              : sortCol === "parent_name"
                ? "부모 가나다"
                : sortCol === "ko_name"
                  ? "태그 가나다"
                  : "사용량"}{" "}
        {sortDir === "asc" ? "오름차순" : "내림차순"} (기간 {PERIODS.find((p) => p.days === days)?.label})
      </p>

      <TagAdminTable rows={pageRows} allKo={allKo} sort={sortCol} dir={sortDir} status={status} />

      {/* 페이지네이션 */}
      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-1 text-sm">
          <Link replace scroll={false} href={qs(base,{ page: page > 1 ? String(page - 1) : undefined })} aria-disabled={page <= 1}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page <= 1 ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            이전
          </Link>
          <span className="px-3 py-1 text-[var(--text-muted)]">{page} / {totalPages}</span>
          <Link replace scroll={false} href={qs(base,{ page: page < totalPages ? String(page + 1) : undefined })} aria-disabled={page >= totalPages}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page >= totalPages ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            다음
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
