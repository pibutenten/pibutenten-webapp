import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// 어드민 전용 타입
// ─────────────────────────────────────────────
type QAStatus = "draft" | "pending_review" | "published" | "archived";
type QAType = "qa" | "post";
type StatusFilter = QAStatus | "all";

type AdminQARow = {
  id: number;
  status: QAStatus;
  type: QAType;
  question: string;
  answer: string | null;
  like_count: number | null;
  view_count: number | null;
  created_at: string;
  doctor: { slug: string; name: string; branch: string | null } | null;
};

type DoctorOption = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type StatusCounts = Record<StatusFilter, number>;

type Props = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    doctor?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 50;

const STATUS_LIST: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "pending_review", label: "검수대기" },
  { key: "published", label: "발행됨" },
  { key: "archived", label: "보관됨" },
];

// status 색상 (제안 사양에 맞춤)
const STATUS_STYLE: Record<QAStatus, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#9E9E9E", fg: "#FFFFFF", label: "초안" },
  pending_review: { bg: "#FFA000", fg: "#FFFFFF", label: "검수대기" },
  published: { bg: "#4CAF50", fg: "#FFFFFF", label: "발행됨" },
  archived: { bg: "#616161", fg: "#FFFFFF", label: "보관됨" },
};

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return (
    v === "all" ||
    v === "draft" ||
    v === "pending_review" ||
    v === "published" ||
    v === "archived"
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function truncate(s: string, len: number): string {
  if (!s) return "";
  return s.length > len ? s.slice(0, len) + "…" : s;
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === null) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminQAsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/qas");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // ── 쿼리 파라미터 파싱 ──
  const statusParam = isStatusFilter(sp.status) ? sp.status : "all";
  const qParam = (sp.q ?? "").trim();
  const doctorSlugParam = (sp.doctor ?? "").trim();
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  // ── 원장 목록 (필터 dropdown용) ──
  const { data: doctorsData } = await supabase
    .from("doctors")
    .select("id, slug, name, branch")
    .order("sort_order", { ascending: true })
    .returns<DoctorOption[]>();
  const doctors: DoctorOption[] = doctorsData ?? [];

  // doctor slug → id 매핑 (필터용)
  let doctorIdFilter: string | null = null;
  if (doctorSlugParam) {
    const found = doctors.find((d) => d.slug === doctorSlugParam);
    doctorIdFilter = found?.id ?? null;
  }

  // ── 상태별 카운트 (탭 표시용) ──
  // 한꺼번에 여러 카운트를 가져오기 위해 각각 head:true count 쿼리 병렬 실행
  async function countByStatus(s: QAStatus | "all"): Promise<number> {
    let qb = supabase.from("qas").select("id", { count: "exact", head: true });
    if (s !== "all") qb = qb.eq("status", s);
    if (doctorIdFilter) qb = qb.eq("doctor_id", doctorIdFilter);
    if (qParam) {
      const escaped = qParam.replace(/[%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      qb = qb.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
    }
    const { count } = await qb;
    return count ?? 0;
  }

  const [cAll, cDraft, cPending, cPublished, cArchived] = await Promise.all([
    countByStatus("all"),
    countByStatus("draft"),
    countByStatus("pending_review"),
    countByStatus("published"),
    countByStatus("archived"),
  ]);

  const statusCounts: StatusCounts = {
    all: cAll,
    draft: cDraft,
    pending_review: cPending,
    published: cPublished,
    archived: cArchived,
  };

  // ── 본 목록 쿼리 ──
  let listQuery = supabase
    .from("qas")
    .select(
      `id, status, type, question, answer, like_count, view_count, created_at,
       doctor:doctors(slug, name, branch)`,
      { count: "exact" },
    );

  if (statusParam !== "all") listQuery = listQuery.eq("status", statusParam);
  if (doctorIdFilter) listQuery = listQuery.eq("doctor_id", doctorIdFilter);
  if (qParam) {
    const escaped = qParam.replace(/[%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    listQuery = listQuery.or(
      `question.ilike.${pattern},answer.ilike.${pattern}`,
    );
  }

  const {
    data: rowsData,
    count: totalCount,
    error: listError,
  } = await listQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
    .returns<AdminQARow[]>();

  const rows: AdminQARow[] = rowsData ?? [];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 페이지네이션 번호 (현재 ± 2)
  const pageNumbers: number[] = [];
  const startPage = Math.max(1, pageNum - 2);
  const endPage = Math.min(totalPages, pageNum + 2);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  // 공통 query baseline (status/doctor/q는 페이지 이동시 유지)
  const baseQuery = {
    status: statusParam === "all" ? undefined : statusParam,
    q: qParam || undefined,
    doctor: doctorSlugParam || undefined,
  };

  return (
    <section className="mx-auto w-full max-w-[1080px] py-6">
      {/* 헤더 */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Q&A 전체 목록</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            관리자 전용 — 총 {total.toLocaleString()}건
          </p>
        </div>
        <Link
          href="/admin/draft"
          className="rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--primary-dark)]"
        >
          + 새 초안 생성 (URL → AI)
        </Link>
      </div>

      {/* status 필터 탭 */}
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--border)]">
        {STATUS_LIST.map((s) => {
          const active = s.key === statusParam;
          const href = `/admin/qas${buildQueryString({
            ...baseQuery,
            status: s.key === "all" ? undefined : s.key,
            page: undefined,
          })}`;
          return (
            <Link
              key={s.key}
              href={href}
              className={
                "relative px-3 py-2 text-sm transition-colors " +
                (active
                  ? "font-semibold text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)]")
              }
            >
              {s.label}
              <span className="ml-1 text-xs text-[var(--text-muted)]">
                ({statusCounts[s.key].toLocaleString()})
              </span>
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* 검색 + 원장 필터 (GET form) */}
      <form
        method="get"
        action="/admin/qas"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        {/* 현재 status를 hidden으로 유지 */}
        {statusParam !== "all" && (
          <input type="hidden" name="status" value={statusParam} />
        )}
        <select
          id="admin-qas-doctor-filter"
          name="doctor"
          defaultValue={doctorSlugParam}
          className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="">전체 원장</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        {/* 원장 변경 시 자동 submit — 검색 버튼 안 눌러도 즉시 필터 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.getElementById('admin-qas-doctor-filter')?.addEventListener('change',function(){this.form&&this.form.submit();});",
          }}
        />
        <input
          type="text"
          name="q"
          defaultValue={qParam}
          placeholder="질문/답변 검색"
          className="h-9 flex-1 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
        >
          검색
        </button>
        {(qParam || doctorSlugParam) && (
          <Link
            href={`/admin/qas${buildQueryString({
              status: statusParam === "all" ? undefined : statusParam,
            })}`}
            className="h-9 inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 에러 */}
      {listError && (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          목록을 불러오지 못했어요.
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
            {listError.message}
          </pre>
        </div>
      )}

      {/* 결과 테이블 */}
      {!listError && rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)]">
          {qParam || doctorSlugParam || statusParam !== "all" ? (
            <>
              조건에 맞는 Q&A가 없어요.
              <br />
              <span className="text-xs text-[var(--text-muted)]">
                필터를 조정하거나 검색어를 변경해 보세요.
              </span>
            </>
          ) : (
            <>
              아직 등록된 Q&A가 없어요.
              <br />
              <Link
                href="/admin/draft"
                className="mt-3 inline-block text-[var(--primary)] hover:underline"
              >
                + 첫 초안 만들기
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">타입</th>
                  <th className="px-3 py-2 text-left font-medium">원장</th>
                  <th className="px-3 py-2 text-left font-medium">질문</th>
                  <th className="px-3 py-2 text-right font-medium">좋아요</th>
                  <th className="px-3 py-2 text-right font-medium">조회수</th>
                  <th className="px-3 py-2 text-left font-medium">생성일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const style = STATUS_STYLE[r.status];
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-soft)]"
                    >
                      <td className="px-3 py-2 align-top text-[var(--text-muted)]">
                        <Link
                          href={`/admin/qas/${r.id}/edit`}
                          className="hover:text-[var(--primary)] hover:underline"
                        >
                          #{r.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: style.bg,
                            color: style.fg,
                          }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-[var(--text-secondary)]">
                        {r.type === "post" ? "글" : "Q&A"}
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--text)]">
                        {r.doctor ? (
                          <span>
                            {r.doctor.name}
                            {r.doctor.branch && (
                              <span className="ml-1 text-xs text-[var(--text-muted)]">
                                {r.doctor.branch}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--text)]">
                        <Link
                          href={`/admin/qas/${r.id}/edit`}
                          className="block hover:text-[var(--primary)] hover:underline"
                          title={r.question}
                        >
                          {truncate(r.question ?? "", 50)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.like_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.view_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-[var(--text-muted)]">
                        {formatDate(r.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <nav
              aria-label="페이지네이션"
              className="mt-4 flex items-center justify-center gap-1"
            >
              <Link
                href={`/admin/qas${buildQueryString({
                  ...baseQuery,
                  page: pageNum > 1 ? pageNum - 1 : undefined,
                })}`}
                aria-disabled={pageNum <= 1}
                className={
                  "h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm transition-colors " +
                  (pageNum <= 1
                    ? "pointer-events-none text-[var(--text-muted)] opacity-50"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
                }
              >
                이전
              </Link>
              {startPage > 1 && (
                <>
                  <Link
                    href={`/admin/qas${buildQueryString({
                      ...baseQuery,
                      page: 1,
                    })}`}
                    className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                  >
                    1
                  </Link>
                  {startPage > 2 && (
                    <span className="px-1 text-[var(--text-muted)]">…</span>
                  )}
                </>
              )}
              {pageNumbers.map((p) => {
                const active = p === pageNum;
                return (
                  <Link
                    key={p}
                    href={`/admin/qas${buildQueryString({
                      ...baseQuery,
                      page: p === 1 ? undefined : p,
                    })}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      "h-9 min-w-9 rounded-[var(--radius-sm)] border px-3 text-sm transition-colors " +
                      (active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
                    }
                  >
                    {p}
                  </Link>
                );
              })}
              {endPage < totalPages && (
                <>
                  {endPage < totalPages - 1 && (
                    <span className="px-1 text-[var(--text-muted)]">…</span>
                  )}
                  <Link
                    href={`/admin/qas${buildQueryString({
                      ...baseQuery,
                      page: totalPages,
                    })}`}
                    className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                  >
                    {totalPages}
                  </Link>
                </>
              )}
              <Link
                href={`/admin/qas${buildQueryString({
                  ...baseQuery,
                  page: pageNum < totalPages ? pageNum + 1 : undefined,
                })}`}
                aria-disabled={pageNum >= totalPages}
                className={
                  "h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm transition-colors " +
                  (pageNum >= totalPages
                    ? "pointer-events-none text-[var(--text-muted)] opacity-50"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
                }
              >
                다음
              </Link>
            </nav>
          )}

          <div className="mt-2 text-center text-xs text-[var(--text-muted)]">
            {pageNum} / {totalPages} 페이지 · {total.toLocaleString()}건
          </div>
        </>
      )}
    </section>
  );
}
