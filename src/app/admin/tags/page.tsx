import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BackButton from "@/components/BackButton";
import TagAdminTable, { type TagRow } from "./TagAdminTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "태그 매니저",
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

type SortCol = "usage" | "search" | "created" | "onb_name" | "parent_name" | "ko_name";
const TEXT_SORTS: SortCol[] = ["onb_name", "parent_name", "ko_name"];

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
  const ALL_SORTS: SortCol[] = ["usage", "search", "created", "onb_name", "parent_name", "ko_name"];
  let sortCol: SortCol = ALL_SORTS.includes(sp.sort as SortCol) ? (sp.sort as SortCol) : "usage";
  let sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  // '새 태그' = 생성일 최근순 강제 (D5 — 상태칩 배타 단일선택)
  if (status === "new") {
    sortCol = "created";
    sortDir = "desc";
  }

  const supabase = await createSupabaseServerClient();
  const { data: rpcData, error } = await supabase.rpc("get_tag_admin_overview", {
    p_days: days,
  });
  const allRows = (error ? [] : ((rpcData ?? []) as TagRow[]));

  // 요약 수치
  const total = allRows.length;
  const classified = allRows.filter((r) => r.category !== "미지정").length;
  const unspec = total - classified;
  const enBlank = allRows.filter((r) => !r.en).length;
  const procCount = allRows.filter((r) => r.is_procedure).length;

  // 카테고리 탭 카운트
  const catCounts: Record<string, number> = { all: total };
  for (const c of CATEGORIES) catCounts[c] = 0;
  for (const r of allRows) catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;

  // 필터 (분류 → 상태 → 검색)
  let rows = allRows;
  if (cat !== "all") rows = rows.filter((r) => r.category === cat);
  if (status === "en_blank") rows = rows.filter((r) => !r.en);
  else if (status === "unspec") rows = rows.filter((r) => r.category === "미지정");
  else if (status === "proc") rows = rows.filter((r) => r.is_procedure);
  else if (status === "onb") rows = rows.filter((r) => !!r.onboarding);
  else if (status === "parent") rows = rows.filter((r) => !!r.parent_ko);
  if (q) rows = rows.filter((r) => r.ko.includes(q));

  // 정렬 (헤더 클릭 / '새 태그' 칩) — 숫자 컬럼 vs 텍스트(가나다) 컬럼 분기. 기본 사용량 내림차순.
  if (TEXT_SORTS.includes(sortCol)) {
    const textOf = (r: TagRow): string =>
      sortCol === "onb_name" ? (r.onboarding ?? "") : sortCol === "parent_name" ? (r.parent_ko ?? "") : r.ko;
    rows = [...rows].sort((a, b) => {
      const d = textOf(a).localeCompare(textOf(b), "ko");
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
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      {/* 제목 — 다른 admin 페이지처럼 '< 뒤로' 아래 줄에 배치 */}
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-4 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">태그 매니저</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          tag_dictionary SSOT · 편집 즉시 / 사이트 색상은 다음 배포 반영
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "전체", v: total },
          { label: "분류완료", v: classified },
          { label: "미지정", v: unspec },
          { label: "영문공란", v: enBlank },
          { label: "시술 후기", v: procCount },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3">
            <div className="text-[11px] text-[var(--text-muted)]">{s.label}</div>
            <div className="text-lg font-bold tabular-nums text-[var(--text)]">{s.v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* 분류 탭 — 단일선택 배타 + 활성 재클릭 시 해제(전체) (D5). 필터 변경은 replace. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link replace href={qs(base, { cat: undefined, page: undefined })} className={chip(cat === "all")}>
          전체 <span className="text-[10px] opacity-70">{catCounts.all.toLocaleString()}</span>
        </Link>
        {CATEGORIES.map((c) => (
          <Link replace key={c} href={qs(base, { cat: cat === c ? undefined : c, page: undefined })} className={chip(cat === c)}>
            {c} <span className="text-[10px] opacity-70">{(catCounts[c] ?? 0).toLocaleString()}</span>
          </Link>
        ))}
      </div>

      {/* 상태 칩(좌, 단일선택 배타) + 기간 칩(우). 활성 칩 재클릭 시 해제→전체 (D5). */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">상태</span>
          <Link replace href={qs(base, { status: undefined, sort: undefined, dir: undefined, page: undefined })} className={chip(status === "all")}>전체</Link>
          {([
            ["en_blank", "영문공란"],
            ["unspec", "미지정"],
            ["proc", "시술 후기"],
            ["onb", "온보딩"],
            ["new", "새 태그"],
          ] as const).map(([key, label]) => {
            const active = status === key;
            // 활성 재클릭 → 해제(전체). 선택 시 이전 정렬 잔재 제거(sort/dir 초기화)로 배타 보장.
            const href = active
              ? qs(base, { status: undefined, sort: undefined, dir: undefined, page: undefined })
              : qs(base, { status: key, sort: undefined, dir: undefined, page: undefined });
            return (
              <Link replace key={key} href={href} className={chip(active)}>
                {label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">기간</span>
          {PERIODS.map((p) => (
            <Link replace key={p.days} href={qs(base, { days: p.days === 0 ? undefined : String(p.days), page: undefined })} className={chip(days === p.days)}>
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
          <Link replace href={qs(base, { page: page > 1 ? String(page - 1) : undefined })} aria-disabled={page <= 1}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page <= 1 ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            이전
          </Link>
          <span className="px-3 py-1 text-[var(--text-muted)]">{page} / {totalPages}</span>
          <Link replace href={qs(base, { page: page < totalPages ? String(page + 1) : undefined })} aria-disabled={page >= totalPages}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page >= totalPages ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            다음
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
