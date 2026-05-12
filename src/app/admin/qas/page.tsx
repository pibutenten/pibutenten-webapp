import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PickToggle from "@/components/PickToggle";
import { labelForCategory } from "@/lib/post-category";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// 어드민 전용 타입
// ─────────────────────────────────────────────
type QAStatus = "draft" | "pending_review" | "published" | "archived";
type QAType = "qa" | "post" | "article";
type TypeFilter = "qa" | "post" | "all"; // v4: 칼럼(article) UI에서 제거
type StatusFilter = QAStatus | "all";
type CategoryFilter = "tip" | "diary" | "ask" | "link" | "all";

type AdminQARow = {
  id: number;
  status: QAStatus;
  type: QAType;
  category: string | null;
  posted_as: "official" | "personal" | null;
  is_pick: boolean | null;
  question: string;
  answer: string | null;
  like_count: number | null;
  view_count: number | null;
  share_count: number | null;
  comments_count: { count: number }[] | null;
  created_at: string;
  doctor: { slug: string; name: string; branch: string | null } | null;
  author: {
    display_name: string | null;
    alt_display_name: string | null;
    handle: string | null;
    alt_handle: string | null;
  } | null;
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
    type?: string;
    category?: string;
    q?: string;
    doctor?: string;
    pick?: string;
    page?: string;
  }>;
};

function isTypeFilter(v: string | undefined): v is TypeFilter {
  return v === "qa" || v === "post" || v === "all";
}

function isCategoryFilter(v: string | undefined): v is CategoryFilter {
  return (
    v === "tip" || v === "diary" || v === "ask" || v === "link" || v === "all"
  );
}

const PAGE_SIZE = 50;

const STATUS_LIST: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "pending_review", label: "대기" },
  { key: "published", label: "발행" },
  { key: "archived", label: "보관" },
];

// status 색상 — 발행은 너무 튀지 않게 외곽선·옅은 톤. 대기·보관은 강조 유지.
const STATUS_STYLE: Record<QAStatus, { bg: string; fg: string; label: string; border?: string }> = {
  draft: { bg: "#F3F4F6", fg: "#6B7280", label: "초안", border: "#E5E7EB" },
  pending_review: { bg: "#FFF7E6", fg: "#B26F00", label: "대기", border: "#FFD08A" },
  published: { bg: "transparent", fg: "#16A34A", label: "발행", border: "#BBF7D0" },
  archived: { bg: "#F3F4F6", fg: "#4B5563", label: "보관", border: "#E5E7EB" },
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

  const viewerRole = (profile?.role ?? "user") as "admin" | "doctor" | "user";
  const isAdmin = viewerRole === "admin";

  // 원장 본인 접근 — doctor_accounts 매핑이 있는 doctor 계정은 본인 글만 열람.
  // role='doctor' but 매핑 없음, role='user'는 차단.
  let ownDoctorSlug: string | null = null;
  let ownDoctorId: string | null = null;
  if (!isAdmin) {
    if (viewerRole === "doctor") {
      const { data: da } = await supabase
        .from("doctor_accounts")
        .select("doctor:doctors(slug, id)")
        .eq("profile_id", user.id)
        .maybeSingle();
      const d = da?.doctor as
        | { slug: string; id: string }
        | { slug: string; id: string }[]
        | null;
      const resolved = Array.isArray(d) ? d[0] : d;
      if (resolved) {
        ownDoctorSlug = resolved.slug;
        ownDoctorId = resolved.id;
      }
    }
    if (!ownDoctorSlug) {
      redirect("/login?error=관리자 권한이 필요합니다");
    }
  }

  // ── 쿼리 파라미터 파싱 ──
  const statusParam = isStatusFilter(sp.status) ? sp.status : "all";
  const typeParam: TypeFilter = isTypeFilter(sp.type) ? sp.type : "all";
  const categoryParam: CategoryFilter = isCategoryFilter(sp.category)
    ? sp.category
    : "all";
  const qParam = (sp.q ?? "").trim();
  // 원장 본인 접근 — doctor 파라미터를 본인 slug로 강제 (URL 조작으로 타 원장 글 열람 차단)
  const doctorSlugParam = isAdmin
    ? (sp.doctor ?? "").trim()
    : (ownDoctorSlug ?? "");
  const pickOnly = sp.pick === "1";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  // ── 원장 목록 (필터 dropdown용 — 관리자만) ──
  const doctorsListResult = isAdmin
    ? await supabase
        .from("doctors")
        .select("id, slug, name, branch")
        .order("sort_order", { ascending: true })
        .returns<DoctorOption[]>()
    : { data: [] as DoctorOption[] };
  const doctors: DoctorOption[] = doctorsListResult.data ?? [];

  // doctor slug → id 매핑 (필터용)
  let doctorIdFilter: string | null = null;
  if (isAdmin) {
    if (doctorSlugParam) {
      const found = doctors.find((d) => d.slug === doctorSlugParam);
      doctorIdFilter = found?.id ?? null;
    }
  } else {
    // 원장 본인 접근 — DB 쿼리 단계에서 본인 doctor_id로 강제 필터
    doctorIdFilter = ownDoctorId;
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
      `id, status, type, category, posted_as, is_pick, question, answer, like_count, view_count, share_count, created_at,
       comments_count:comments(count),
       doctor:doctors(slug, name, branch),
       author:profiles!qas_author_id_profiles_fkey(display_name, alt_display_name, handle, alt_handle)`,
      { count: "exact" },
    );

  if (statusParam !== "all") listQuery = listQuery.eq("status", statusParam);
  if (typeParam !== "all") listQuery = listQuery.eq("type", typeParam);
  if (categoryParam !== "all")
    listQuery = listQuery.eq("category", categoryParam);
  if (doctorIdFilter) listQuery = listQuery.eq("doctor_id", doctorIdFilter);
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
    .returns<AdminQARow[]>();

  const rows: AdminQARow[] = rowsData ?? [];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 페이지네이션 번호 (현재 ± 2)
  const pageNumbers: number[] = [];
  const startPage = Math.max(1, pageNum - 2);
  const endPage = Math.min(totalPages, pageNum + 2);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  // 공통 query baseline (status/type/category/doctor/pick/q는 페이지 이동시 유지)
  const baseQuery = {
    status: statusParam === "all" ? undefined : statusParam,
    type: typeParam === "all" ? undefined : typeParam,
    category: categoryParam === "all" ? undefined : categoryParam,
    pick: pickOnly ? "1" : undefined,
    q: qParam || undefined,
    doctor: doctorSlugParam || undefined,
  };

  // v4: 칼럼(article)은 UI에서 제거. 타입은 포스팅·Q&A 두 종류.
  const TYPE_LIST: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "전체 타입" },
    { key: "post", label: "포스팅" },
    { key: "qa", label: "Q&A" },
  ];

  // 포스팅 카테고리 — Q&A 카테고리는 type=qa이므로 제외, 포스팅 4종만
  const CATEGORY_LIST: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "전체 카테고리" },
    { key: "tip", label: "피부꿀팁" },
    { key: "diary", label: "피부일기" },
    { key: "ask", label: "궁금해요" },
    { key: "link", label: "공유하기" },
  ];

  return (
    <section className="w-full py-6">
      {/* 헤더 */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            {isAdmin ? "전체 카드 목록" : "내 글 관리"}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {isAdmin
              ? `관리자 전용 — 총 ${total.toLocaleString()}건`
              : `본인 글 — 총 ${total.toLocaleString()}건`}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/draft"
            className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            + 새 초안
          </Link>
        )}
      </div>

      {/* status 필터 탭 — 모바일에선 라벨 위 / 카운트 아래 (한 줄에 다 보이게) */}
      <div className="mb-3 flex gap-0 border-b border-[var(--border)] overflow-x-auto sm:gap-1 [&::-webkit-scrollbar]:hidden">
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
                "relative shrink-0 px-2 py-1.5 text-center text-[12px] sm:px-3 sm:py-2 sm:text-sm transition-colors " +
                (active
                  ? "font-semibold text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)]")
              }
            >
              <div className="whitespace-nowrap leading-tight">{s.label}</div>
              <div className="text-[10px] text-[var(--text-muted)] sm:inline sm:text-xs sm:ml-1 sm:align-middle">
                {statusCounts[s.key].toLocaleString()}
              </div>
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* type + 포스팅 카테고리 + Pick 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-0.5">
          {TYPE_LIST.map((t) => {
            const active = t.key === typeParam;
            // 타입을 바꾸면 카테고리는 reset (qa로 가면 카테고리 의미 없음)
            const href = `/admin/qas${buildQueryString({
              ...baseQuery,
              type: t.key === "all" ? undefined : t.key,
              category: t.key === "post" ? baseQuery.category : undefined,
              page: undefined,
            })}`;
            return (
              <Link
                key={t.key}
                href={href}
                className={
                  "rounded-[var(--radius-sm)] px-3 py-1 text-xs transition-colors " +
                  (active
                    ? "font-semibold text-[var(--text)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
                }
                style={
                  active ? { backgroundColor: "#7DC1DD33" } : undefined
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* 포스팅 카테고리 — type=post 일 때만 의미. type=qa·all 일 때는 disabled 톤. */}
        {typeParam === "post" && (
          <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-0.5">
            {CATEGORY_LIST.map((c) => {
              const active = c.key === categoryParam;
              const href = `/admin/qas${buildQueryString({
                ...baseQuery,
                category: c.key === "all" ? undefined : c.key,
                page: undefined,
              })}`;
              return (
                <Link
                  key={c.key}
                  href={href}
                  className={
                    "rounded-[var(--radius-sm)] px-3 py-1 text-xs transition-colors " +
                    (active
                      ? "font-semibold text-[var(--text)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
                  }
                  style={
                    active ? { backgroundColor: "#A8D8B933" } : undefined
                  }
                >
                  {c.label}
                </Link>
              );
            })}
          </div>
        )}
        <Link
          href={`/admin/qas${buildQueryString({
            ...baseQuery,
            pick: pickOnly ? undefined : "1",
            page: undefined,
          })}`}
          className={
            "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-3 py-1 text-xs transition-colors " +
            (pickOnly
              ? "border-amber-400 bg-amber-50 text-amber-800"
              : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-amber-300")
          }
        >
          ⭐ {pickOnly ? "Pick만 보는 중" : "Pick만 보기"}
        </Link>
      </div>

      {/* 검색 + 원장 필터 (GET form) — 모바일/데스크탑 모두 한 줄 */}
      <form
        method="get"
        action="/admin/qas"
        className="mb-4 flex items-center gap-2"
      >
        {/* 현재 status/type/pick을 hidden으로 유지 */}
        {statusParam !== "all" && (
          <input type="hidden" name="status" value={statusParam} />
        )}
        {typeParam !== "all" && (
          <input type="hidden" name="type" value={typeParam} />
        )}
        {categoryParam !== "all" && (
          <input type="hidden" name="category" value={categoryParam} />
        )}
        {pickOnly && <input type="hidden" name="pick" value="1" />}
        {/* 원장 필터 — 관리자 전용. 원장 본인 접근 시 본인 slug가 서버에서 강제 적용됨 */}
        {isAdmin ? (
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
        ) : (
          // 원장 본인은 doctor 파라미터를 서버에서 강제 적용. 필터 UI 없음.
          <input type="hidden" name="doctor" value={doctorSlugParam} />
        )}
        <input
          type="text"
          name="q"
          defaultValue={qParam}
          placeholder="제목/본문 검색"
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
                  <th className="px-3 py-2 text-center font-medium">Pick</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">타입</th>
                  <th className="px-3 py-2 text-left font-medium">글쓴이</th>
                  <th className="px-3 py-2 text-left font-medium">제목</th>
                  <th className="px-3 py-2 text-right font-medium">좋아요</th>
                  <th className="px-3 py-2 text-right font-medium">조회수</th>
                  <th className="px-3 py-2 text-right font-medium">댓글</th>
                  <th className="px-3 py-2 text-right font-medium">공유</th>
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
                      <td className="px-3 py-2 align-top text-center">
                        <PickToggle qaId={r.id} initial={!!r.is_pick} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: style.bg,
                            color: style.fg,
                            borderColor: style.border ?? "transparent",
                          }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-[var(--text-secondary)]">
                        {/* v4: 포스팅이면 카테고리만 표기 (꿀팁/피부일기/물어봐요/새소식),
                            Q&A이면 'Q&A'. 컬럼 가로폭 절약. */}
                        {r.type === "qa"
                          ? "Q&A"
                          : labelForCategory(r.category) || "포스팅"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-[var(--text)]">
                        {/* 글쓴이 — 의사 official 글이면 원장 이름, 그 외엔 닉네임(handle/display_name) */}
                        {r.doctor && r.posted_as === "official" ? (
                          <span>{r.doctor.name}</span>
                        ) : r.author ? (
                          <span>
                            {r.posted_as === "personal"
                              ? r.author.alt_display_name ??
                                r.author.alt_handle ??
                                r.author.handle ??
                                "—"
                              : r.author.display_name ??
                                r.author.handle ??
                                "—"}
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
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.comments_count?.[0]?.count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.share_count ?? 0).toLocaleString()}
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
