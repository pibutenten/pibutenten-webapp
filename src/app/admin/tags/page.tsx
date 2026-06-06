import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BackButton from "@/components/BackButton";
import TagAdminTable, { type TagRow } from "./TagAdminTable";
import TagQueue, { type QueueRow } from "./TagQueue";

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
  }>;
};

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

  const supabase = await createSupabaseServerClient();
  const { data: rpcData, error } = await supabase.rpc("get_tag_admin_overview", {
    p_days: days,
  });
  const allRows = (error ? [] : ((rpcData ?? []) as TagRow[]));

  // 검수큐
  const { data: queueData } = await supabase
    .from("tag_review_queue")
    .select("id, ko, suggested_en, source")
    .order("created_at", { ascending: false })
    .limit(200);
  const queue = (queueData ?? []) as QueueRow[];

  // 요약 수치
  const total = allRows.length;
  const classified = allRows.filter((r) => r.category !== "미지정").length;
  const unspec = total - classified;
  const enBlank = allRows.filter((r) => !r.en).length;

  // 카테고리 탭 카운트
  const catCounts: Record<string, number> = { all: total };
  for (const c of CATEGORIES) catCounts[c] = 0;
  for (const r of allRows) catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;

  // 필터 (분류 → 상태 → 검색)
  let rows = allRows;
  if (cat !== "all") rows = rows.filter((r) => r.category === cat);
  if (status === "en_blank") rows = rows.filter((r) => !r.en);
  else if (status === "unspec") rows = rows.filter((r) => r.category === "미지정");
  if (q) rows = rows.filter((r) => r.ko.includes(q));

  const filteredCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(pageNum, totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const base = { cat: sp.cat, status: sp.status, q: sp.q, days: sp.days };

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <BackButton />
        <h1 className="text-lg font-bold text-[var(--text)]">태그 매니저</h1>
        <span className="text-xs text-[var(--text-muted)]">tag_dictionary SSOT · 편집 즉시 / 사이트 색상은 다음 배포 반영</span>
      </div>

      {/* 요약 카드 */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "전체", v: total },
          { label: "분류완료", v: classified },
          { label: "미지정", v: unspec },
          { label: "영문공란", v: enBlank },
          { label: "검수대기", v: queue.length },
        ].map((s) => (
          <div key={s.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3">
            <div className="text-[11px] text-[var(--text-muted)]">{s.label}</div>
            <div className="text-lg font-bold tabular-nums text-[var(--text)]">{s.v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* 분류 탭 */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link href={qs(base, { cat: undefined, page: undefined })} className={chip(cat === "all")}>
          전체 <span className="text-[10px] opacity-70">{catCounts.all.toLocaleString()}</span>
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={qs(base, { cat: c, page: undefined })} className={chip(cat === c)}>
            {c} <span className="text-[10px] opacity-70">{(catCounts[c] ?? 0).toLocaleString()}</span>
          </Link>
        ))}
      </div>

      {/* 상태 칩 + 기간 칩 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[var(--text-muted)]">상태</span>
        <Link href={qs(base, { status: undefined, page: undefined })} className={chip(status === "all")}>전체</Link>
        <Link href={qs(base, { status: "en_blank", page: undefined })} className={chip(status === "en_blank")}>영문공란</Link>
        <Link href={qs(base, { status: "unspec", page: undefined })} className={chip(status === "unspec")}>미지정</Link>
        <a href="#tag-queue" className={chip(false)}>검수대기 {queue.length}</a>
        <span className="mx-2 h-4 w-px bg-[var(--border)]" />
        <span className="text-[11px] text-[var(--text-muted)]">기간</span>
        {PERIODS.map((p) => (
          <Link key={p.days} href={qs(base, { days: p.days === 0 ? undefined : String(p.days), page: undefined })} className={chip(days === p.days)}>
            {p.label}
          </Link>
        ))}
      </div>

      {/* 검색 */}
      <form action="/admin/tags" method="get" className="mb-3 flex items-center gap-2">
        {sp.cat ? <input type="hidden" name="cat" value={sp.cat} /> : null}
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        {sp.days ? <input type="hidden" name="days" value={sp.days} /> : null}
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
        {filteredCount.toLocaleString()}개 · 사용량 내림차순 (기간 {PERIODS.find((p) => p.days === days)?.label})
      </p>

      <TagAdminTable rows={pageRows} />

      {/* 페이지네이션 */}
      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-1 text-sm">
          <Link href={qs(base, { page: page > 1 ? String(page - 1) : undefined })} aria-disabled={page <= 1}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page <= 1 ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            이전
          </Link>
          <span className="px-3 py-1 text-[var(--text-muted)]">{page} / {totalPages}</span>
          <Link href={qs(base, { page: page < totalPages ? String(page + 1) : undefined })} aria-disabled={page >= totalPages}
            className={"rounded border border-[var(--border)] px-3 py-1 " + (page >= totalPages ? "pointer-events-none opacity-40" : "hover:border-[var(--primary)]")}>
            다음
          </Link>
        </nav>
      ) : null}

      {/* 검수큐 */}
      <section id="tag-queue" className="mt-8">
        <h2 className="mb-2 text-sm font-bold text-[var(--text)]">검수 대기 큐 <span className="text-xs font-normal text-[var(--text-muted)]">({queue.length})</span></h2>
        <TagQueue initial={queue} />
      </section>
    </div>
  );
}
