import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { type TagRow } from "./TagAdminTable";
import AdminTagsView from "./AdminTagsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "태그 관리",
  robots: { index: false, follow: false },
};

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정"] as const;
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
    rv?: string; // 미지정 검토: 'all' 이면 검토완료 포함(기본=미검토만)
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

export default async function AdminTagsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/tags", { superAdminOnly: true });
  const sp = await searchParams;
  const cat = sp.cat ?? "all";
  const status = sp.status ?? "all";
  const inclReviewed = sp.rv === "all"; // 미지정: 검토완료 포함 보기
  const q = (sp.q ?? "").trim();
  const days = Number.parseInt(sp.days ?? "0", 10) || 0;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const ALL_SORTS: SortCol[] = ["usage", "search", "created", "onb_name", "parent_name", "ko_name", "cat_name", "en_name"];
  let sortCol: SortCol = ALL_SORTS.includes(sp.sort as SortCol) ? (sp.sort as SortCol) : "usage";
  let sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
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
  const [allC, enNullC, procC, parentC, ...catCs] = await Promise.all([
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }),
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).is("en", null),
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).eq("is_procedure", true),
    supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).not("parent_ko", "is", null),
    ...CATEGORIES.map((c) =>
      supabase.from("tag_dictionary").select("id", { count: "exact", head: true }).eq("category", c),
    ),
  ]);
  const total = allC.count ?? 0;
  const enBlank = enNullC.count ?? 0;
  const procCount = procC.count ?? 0;
  const parentCount = parentC.count ?? 0;
  // 미검토 미지정 개수(전체 미지정과 구분) — allRows(전체 모수)에서 reviewed_at NULL.
  const unspecUnreviewed = allRows.filter(
    (r) => r.category === "미지정" && !r.reviewed_at,
  ).length;
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
  else if (status === "triage")
    // 검토 전용: 미검토 미지정(분류=미지정 & reviewed_at NULL). '포함 보기'(rv=all)면 검토완료도.
    rows = rows.filter((r) => r.category === "미지정" && (inclReviewed || !r.reviewed_at));
  else if (status === "classified") rows = rows.filter((r) => r.category !== "미지정");
  else if (status === "proc") rows = rows.filter((r) => r.is_procedure);
  else if (status === "onb") rows = rows.filter((r) => !!r.onboarding);
  else if (status === "parent") rows = rows.filter((r) => !!r.parent_ko);
  else if (status === "eng") rows = rows.filter((r) => /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(r.ko)); // G2: ko 가 영문(한글 미포함)
  if (q) rows = rows.filter((r) => r.ko.includes(q));

  // 정렬 (헤더 클릭) — 숫자 컬럼 vs 텍스트(가나다/알파벳) 컬럼 분기. 기본 사용량 내림차순.
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
    rv: sp.rv,
  };
  // 검색폼 hidden input 용 — q 제외 원본 searchParams (운영 동일).
  const rawSp = {
    cat: sp.cat,
    status: sp.status,
    days: sp.days,
    sort: sp.sort,
    dir: sp.dir,
    rv: sp.rv,
  };
  // 부모 autocomplete + 검증용 전체 태그 ko (전 페이지 기준)
  const allKo = allRows.map((r) => r.ko);
  // 이름 변경 모달 병합 안내용 — 전체 태그 ko → 사용량.
  const usageByKo: Record<string, number> = {};
  for (const r of allRows) usageByKo[r.ko] = r.usage;

  return (
    <AdminTagsView
      total={total}
      classified={classified}
      enBlank={enBlank}
      procCount={procCount}
      parentCount={parentCount}
      unspecUnreviewed={unspecUnreviewed}
      catCounts={catCounts}
      cat={cat}
      status={status}
      q={q}
      days={days}
      inclReviewed={inclReviewed}
      sortCol={sortCol}
      sortDir={sortDir}
      base={base}
      rawSp={rawSp}
      page={page}
      totalPages={totalPages}
      pageRows={pageRows}
      allKo={allKo}
      usageByKo={usageByKo}
    />
  );
}
