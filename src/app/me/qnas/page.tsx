import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QAStatus = "draft" | "pending_review" | "published" | "archived";
type StatusFilter = QAStatus | "all";

type MyQARow = {
  id: number;
  status: QAStatus;
  type: "qa" | "post";
  question: string;
  answer: string | null;
  is_pick: boolean | null;
  like_count: number | null;
  view_count: number | null;
  comments_count: { count: number }[] | null;
  created_at: string;
};

type Props = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    pick?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;

const STATUS_LIST: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending_review", label: "대기" },
  { key: "published", label: "발행" },
  { key: "draft", label: "초안" },
  { key: "archived", label: "보관" },
];

const STATUS_STYLE: Record<QAStatus, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#9E9E9E", fg: "#FFFFFF", label: "초안" },
  pending_review: { bg: "#FFA000", fg: "#FFFFFF", label: "대기" },
  published: { bg: "#4CAF50", fg: "#FFFFFF", label: "발행" },
  archived: { bg: "#616161", fg: "#FFFFFF", label: "보관" },
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

export default async function MyQnasPage({ searchParams }: Props) {
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/qnas");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");
  if (profile.role !== "doctor" && profile.role !== "admin") {
    redirect("/?error=원장 또는 관리자만 접근 가능합니다");
  }

  // doctor 매핑
  const { data: da } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", user.id)
    .maybeSingle()
    .returns<{ doctor_id: string } | null>();

  const doctorId = da?.doctor_id ?? null;
  if (!doctorId && profile.role === "doctor") {
    return (
      <section className="w-full py-6">
        <div className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          원장 doctor 매핑이 없습니다. 관리자에게 문의해주세요.
        </div>
      </section>
    );
  }
  if (!doctorId) {
    // admin이지만 doctor 매핑 없음 → admin 페이지로
    redirect("/admin/qas");
  }

  // ── 쿼리 파라미터 ──
  const statusParam = isStatusFilter(sp.status) ? sp.status : "all";
  const qParam = (sp.q ?? "").trim();
  const pickOnly = sp.pick === "true";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  // ── 상태별 카운트 (탭) ──
  async function countByStatus(s: StatusFilter): Promise<number> {
    let qb = supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", doctorId);
    if (s !== "all") qb = qb.eq("status", s);
    if (pickOnly) qb = qb.eq("is_pick", true);
    if (qParam) {
      const escaped = qParam.replace(/[%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      qb = qb.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
    }
    const { count } = await qb;
    return count ?? 0;
  }

  const [cAll, cPending, cPublished, cDraft, cArchived, pickCount] = await Promise.all([
    countByStatus("all"),
    countByStatus("pending_review"),
    countByStatus("published"),
    countByStatus("draft"),
    countByStatus("archived"),
    // pickCount는 항상 전체 (pickOnly 무관)
    supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", doctorId)
      .eq("is_pick", true)
      .then((r) => r.count ?? 0),
  ]);

  const statusCounts: Record<StatusFilter, number> = {
    all: cAll,
    draft: cDraft,
    pending_review: cPending,
    published: cPublished,
    archived: cArchived,
  };

  // ── 본 목록 ──
  let listQuery = supabase
    .from("qas")
    .select(
      `id, status, type, question, answer, is_pick, like_count, view_count, comments_count:comments(count), created_at`,
      { count: "exact" },
    )
    .eq("doctor_id", doctorId);

  if (statusParam !== "all") listQuery = listQuery.eq("status", statusParam);
  if (pickOnly) listQuery = listQuery.eq("is_pick", true);
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
    .returns<MyQARow[]>();

  const rows: MyQARow[] = rowsData ?? [];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 페이지 번호 (현재 ± 2)
  const pageNumbers: number[] = [];
  const startPage = Math.max(1, pageNum - 2);
  const endPage = Math.min(totalPages, pageNum + 2);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  const baseQuery = {
    status: statusParam === "all" ? undefined : statusParam,
    q: qParam || undefined,
    pick: pickOnly ? "true" : undefined,
  };

  const pageTitle = pickOnly ? "내 Pick" : "내 글 관리";

  return (
    <section className="w-full py-6">
      {/* 헤더 */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{pageTitle}</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {pickOnly
              ? `Pick ${pickCount} / 5 — 다른 글의 Pick을 토글하려면 글을 열어 편집하세요.`
              : `총 ${total.toLocaleString()}건`}
          </p>
        </div>
        <Link
          href="/me"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 마이페이지
        </Link>
      </div>

      {/* Pick 모드 / 일반 전환 */}
      {!pickOnly && pickCount > 0 && (
        <div className="mb-3">
          <Link
            href="/me/qnas?pick=true"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            ⭐ Pick만 보기 ({pickCount}/5)
          </Link>
        </div>
      )}
      {pickOnly && (
        <div className="mb-3">
          <Link
            href="/me/qnas"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            ← 전체 글 보기
          </Link>
        </div>
      )}

      {/* 상태 탭 (pickOnly 모드에선 숨김 — Pick은 보통 published만 의미가 있음) */}
      {!pickOnly && (
        <div className="mb-3 flex gap-0 border-b border-[var(--border)] overflow-x-auto sm:gap-1 [&::-webkit-scrollbar]:hidden">
          {STATUS_LIST.map((s) => {
            const active = s.key === statusParam;
            const href = `/me/qnas${buildQueryString({
              ...baseQuery,
              status: s.key === "all" ? undefined : s.key,
              page: undefined,
            })}`;
            const isPending = s.key === "pending_review";
            const cnt = statusCounts[s.key] ?? 0;
            return (
              <Link
                key={s.key}
                href={href}
                className={
                  "relative shrink-0 px-2 py-1.5 text-center text-[12px] sm:px-3 sm:py-2 sm:text-sm transition-colors " +
                  (active
                    ? "font-semibold text-[var(--primary)]"
                    : isPending && cnt > 0
                      ? "font-semibold text-amber-600 hover:text-amber-700"
                      : "text-[var(--text-secondary)] hover:text-[var(--text)]")
                }
              >
                <div className="whitespace-nowrap leading-tight">
                  {s.label}
                  {isPending && cnt > 0 && !active && " ●"}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] sm:inline sm:text-xs sm:ml-1 sm:align-middle">
                  {cnt.toLocaleString()}
                </div>
                {active && (
                  <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* 검색 form */}
      <form
        method="get"
        action="/me/qnas"
        className="mb-4 flex items-center gap-2"
      >
        {statusParam !== "all" && (
          <input type="hidden" name="status" value={statusParam} />
        )}
        {pickOnly && <input type="hidden" name="pick" value="true" />}
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
        {qParam && (
          <Link
            href={`/me/qnas${buildQueryString({
              status: statusParam === "all" ? undefined : statusParam,
              pick: pickOnly ? "true" : undefined,
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

      {/* 결과 */}
      {!listError && rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)]">
          {qParam || statusParam !== "all" || pickOnly ? (
            <>
              조건에 맞는 글이 없어요.
              <br />
              <span className="text-xs text-[var(--text-muted)]">
                필터를 조정하거나 검색어를 변경해 보세요.
              </span>
            </>
          ) : (
            <>아직 등록된 글이 없어요.</>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-[var(--bg-soft)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">Pick</th>
                  <th className="px-3 py-2 text-left font-medium">질문</th>
                  <th className="px-3 py-2 text-right font-medium">좋아요</th>
                  <th className="px-3 py-2 text-right font-medium">조회수</th>
                  <th className="px-3 py-2 text-right font-medium">댓글</th>
                  <th className="px-3 py-2 text-left font-medium">생성일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const style = STATUS_STYLE[r.status];
                  const isPending = r.status === "pending_review";
                  return (
                    <tr
                      key={r.id}
                      className={
                        "border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-soft)] " +
                        (isPending ? "bg-amber-50/50" : "")
                      }
                    >
                      <td className="px-3 py-2 align-top text-[var(--text-muted)]">
                        <Link
                          href={`/me/qnas/${r.id}/edit`}
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
                        {isPending && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            검수 필요
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r.is_pick ? (
                          <span title="원장님 Pick" aria-label="Pick">⭐</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--text)]">
                        <Link
                          href={`/me/qnas/${r.id}/edit`}
                          className="block hover:text-[var(--primary)] hover:underline"
                          title={r.question}
                        >
                          {truncate(r.question ?? "", 60)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.like_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.view_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.comments_count?.[0]?.count ?? 0).toLocaleString()}
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
                href={`/me/qnas${buildQueryString({
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
              {pageNumbers.map((p) => {
                const active = p === pageNum;
                return (
                  <Link
                    key={p}
                    href={`/me/qnas${buildQueryString({
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
              <Link
                href={`/me/qnas${buildQueryString({
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
