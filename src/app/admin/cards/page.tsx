import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PickToggle from "@/components/PickToggle";
import { labelForCategory } from "@/lib/post-category";
import AdminCardsDoctorFilter from "./AdminCardsDoctorFilter";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import BackButton from "@/components/BackButton";
import { formatYmd } from "@/lib/format-date";
import { truncate } from "@/lib/string-utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "카드 관리",
  robots: { index: false, follow: false },
};

// ─────────────────────────────────────────────
// 어드민 전용 타입
// ─────────────────────────────────────────────
// 2026-05-28: DB enum qa_status 는 5종 (draft/pending_review/published/archived/hidden).
//   옛 타입이 'hidden' 누락 → DB 에 status='hidden' row 4건이 들어오면 STATUS_STYLE['hidden']
//   undefined → "Cannot read properties of undefined (reading 'bg')" → /admin/cards 500 회귀.
//   DB enum 과 1:1 정합 + 방어 fallback 도 같이 추가.
type QAStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived"
  | "hidden";
type QAType = "qa" | "post";
type TypeFilter = "qa" | "post" | "review" | "review_summary" | "all";
// 'deleted' 는 가짜 status — 실제 DB 상태 컬럼이 아니라 deleted_at IS NOT NULL row 의 카드.
// 0132 soft-delete 도입과 함께 추가 (260518).
type StatusFilter = QAStatus | "all" | "deleted";
type CategoryFilter = "doodle" | "all";

type AdminQARow = {
  id: number;
  status: QAStatus;
  type: QAType;
  category: string | null;
  post_slug: string | null;
  is_pick: boolean | null;
  title: string;
  body: string | null;
  like_count: number | null;
  view_count: number | null;
  save_count: number | null;
  share_count: number | null;
  comments_count: { count: number }[] | null;
  created_at: string;
  deleted_at: string | null;
  doctor: { slug: string; name: string; branch: string | null } | null;
  author: {
    display_name: string | null;
    handle: string | null;
  } | null;
};

type DoctorOption = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type StatusCounts = Record<StatusFilter, number>;

function isStatusFilter(v: string | undefined): v is StatusFilter {
  return (
    v === "draft" ||
    v === "pending_review" ||
    v === "published" ||
    v === "archived" ||
    v === "hidden" ||
    v === "all" ||
    v === "deleted"
  );
}

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
  return (
    v === "qa" ||
    v === "post" ||
    v === "review" ||
    v === "review_summary" ||
    v === "all"
  );
}

function isCategoryFilter(v: string | undefined): v is CategoryFilter {
  return v === "doodle" || v === "all";
}

const PAGE_SIZE = 50;

const STATUS_LIST: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "pending_review", label: "대기" },
  { key: "published", label: "발행" },
  { key: "archived", label: "보관" },
  { key: "hidden", label: "숨김" },
  { key: "deleted", label: "삭제됨" },
];

// status 색상 — 발행은 너무 튀지 않게 외곽선·옅은 톤. 대기·보관은 강조 유지.
// 2026-05-28: hidden 추가 (DB qa_status 와 1:1 정합).
// 2026-05-28 (사용자 보고): 'deleted' 가짜 status 추가 — deleted_at IS NOT NULL row 의 상태 표기.
//   ('deleted' 는 DB enum 이 아니라 deleted_at 기준 표기용 라벨. row 렌더 분기에서만 사용.)
const STATUS_STYLE: Record<QAStatus | "deleted", { bg: string; fg: string; label: string; border?: string }> = {
  draft: { bg: "#F3F4F6", fg: "#6B7280", label: "초안", border: "#E5E7EB" },
  pending_review: { bg: "#FFF7E6", fg: "#B26F00", label: "대기", border: "#FFD08A" },
  published: { bg: "transparent", fg: "#16A34A", label: "발행", border: "#BBF7D0" },
  archived: { bg: "#F3F4F6", fg: "#4B5563", label: "보관", border: "#E5E7EB" },
  hidden: { bg: "#FEF2F2", fg: "#B91C1C", label: "숨김", border: "#FECACA" },
  deleted: { bg: "#FEF2F2", fg: "#991B1B", label: "삭제", border: "#FCA5A5" },
};
// 방어 fallback — 향후 enum 에 새 status 가 추가됐는데 위 STATUS_STYLE 갱신 누락 시
// crash 대신 default 톤으로 렌더 (가시성 손상 최소).
const STATUS_STYLE_FALLBACK = {
  bg: "#F3F4F6",
  fg: "#6B7280",
  label: "?",
  border: "#E5E7EB",
} as const;


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

  // 권한 분기 (2026-05-22 active 기준 통일):
  //   active identity = admin role    → super admin (전체 카드, 전체 원장 dropdown)
  //   active identity = doctor + 매핑 → 본인 doctor 모드 (전체 글 안 보임, 본인만)
  //
  // 사용자 결정 (2026-05-22): 멀티 아이디 사용자가 doctor 로 active 전환 시
  // super admin 권한 묶음(예: 배정민+개발자)이라도 "그 정체성" 기준으로 동작.
  // active=배정민(doctor) 일 때 본인 글만 보여야. super admin 권한은 active=개발자(admin) 일 때만 발휘.
  const guard = await requireAdminPage("/admin/cards");
  const supabase = await createSupabaseServerClient();
  const isActiveDoctor =
    guard.active?.role === ROLES.DOCTOR && !!guard.activeDoctorId;
  const isAdmin = guard.isSuperAdmin && !isActiveDoctor;

  // 본인 doctor 정보 lookup — active 가 doctor 면 강제 본인 doctor 필터링용
  let ownDoctorSlug: string | null = null;
  let ownDoctorId: string | null = null;
  let ownDoctorName: string | null = null;
  if (isActiveDoctor && guard.activeDoctorId) {
    const { data: d } = await supabase
      .from("doctors")
      .select("slug, id, name")
      .eq("id", guard.activeDoctorId)
      .maybeSingle();
    if (d) {
      ownDoctorSlug = d.slug as string;
      ownDoctorId = d.id as string;
      ownDoctorName = d.name as string;
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
  // 한꺼번에 여러 카운트를 가져오기 위해 각각 head:true count 쿼리 병렬 실행.
  // type/category/doctor 필터는 status 탭에도 반영해야 대시보드 KPI(예: type=qa published)와 일치.
  async function countByStatus(s: StatusFilter): Promise<number> {
    let qb = supabase.from("cards").select("id", { count: "exact", head: true });
    // 'deleted' 는 special — deleted_at IS NOT NULL row 만. 그 외는 살아있는 카드 (RLS 가 강제하지만 명시).
    if (s === "deleted") {
      qb = qb.not("deleted_at", "is", null);
    } else {
      qb = qb.is("deleted_at", null);
      if (s !== "all") qb = qb.eq("status", s);
    }
    if (typeParam !== "all") qb = qb.eq("type", typeParam);
    if (categoryParam !== "all") qb = qb.eq("category", categoryParam);
    if (doctorIdFilter) qb = qb.eq("doctor_id", doctorIdFilter);
    if (qParam) {
      const escaped = qParam.replace(/[%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      qb = qb.or(`title.ilike.${pattern},body.ilike.${pattern}`);
    }
    const { count } = await qb;
    return count ?? 0;
  }

  const [cAll, cDraft, cPending, cPublished, cArchived, cHidden, cDeleted] =
    await Promise.all([
      countByStatus("all"),
      countByStatus("draft"),
      countByStatus("pending_review"),
      countByStatus("published"),
      countByStatus("archived"),
      countByStatus("hidden"),
      countByStatus("deleted"),
    ]);

  const statusCounts: StatusCounts = {
    all: cAll,
    draft: cDraft,
    pending_review: cPending,
    published: cPublished,
    archived: cArchived,
    hidden: cHidden,
    deleted: cDeleted,
  };

  // ── 본 목록 쿼리 ──
  let listQuery = supabase
    .from("cards")
    .select(
      `id, status, type, category, post_slug, is_pick, title, body, like_count, view_count, save_count, share_count, created_at, deleted_at,
       comments_count:comments(count),
       doctor:doctors(slug, name, branch),
       author:profiles!cards_author_id_profiles_fkey(display_name, handle)`,
      { count: "exact" },
    );

  // 'deleted' 탭이면 deleted_at IS NOT NULL row 만, 그 외는 살아있는 카드만.
  if (statusParam === "deleted") {
    listQuery = listQuery.not("deleted_at", "is", null);
  } else {
    listQuery = listQuery.is("deleted_at", null);
    if (statusParam !== "all") listQuery = listQuery.eq("status", statusParam);
  }
  if (typeParam !== "all") listQuery = listQuery.eq("type", typeParam);
  if (categoryParam !== "all")
    listQuery = listQuery.eq("category", categoryParam);
  if (doctorIdFilter) listQuery = listQuery.eq("doctor_id", doctorIdFilter);
  if (pickOnly) listQuery = listQuery.eq("is_pick", true);
  if (qParam) {
    const escaped = qParam.replace(/[%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    listQuery = listQuery.or(
      `title.ilike.${pattern},body.ilike.${pattern}`,
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

  // 타입 5종 (전체 카테고리 줄은 폐지, 2026-06-01).
  const TYPE_LIST: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "전체 타입" },
    { key: "qa", label: "Q&A" },
    { key: "post", label: "끄적끄적" },
    { key: "review", label: "시술후기" },
    { key: "review_summary", label: "피부텐텐 리포트" },
  ];

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      {/* 헤더 — 박스 내용과 시각적 정렬 위해 살짝 들여쓰기 */}
      <div className="mb-5 flex items-baseline justify-between gap-3 pl-1">
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
          const href = `/admin/cards${buildQueryString({
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
            const href = `/admin/cards${buildQueryString({
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

        <Link
          href={`/admin/cards${buildQueryString({
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
        action="/admin/cards"
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
        {/* 원장 필터:
             - 관리자: select, onChange 즉시 navigate (검색 버튼 없이 자동 적용)
             - 원장 본인: readonly chip으로 본인 이름 표시. doctor 파라미터는 서버에서 강제 적용 */}
        {isAdmin ? (
          <AdminCardsDoctorFilter
            doctors={doctors.map((d) => ({
              id: d.id,
              slug: d.slug,
              name: d.name,
            }))}
            currentSlug={doctorSlugParam}
            basePath={`/admin/cards${buildQueryString({
              status: statusParam === "all" ? undefined : statusParam,
              type: typeParam === "all" ? undefined : typeParam,
              category: categoryParam === "all" ? undefined : categoryParam,
              pick: pickOnly ? "1" : undefined,
              q: qParam || undefined,
              doctor: doctorSlugParam || undefined,
            })}`}
          />
        ) : (
          <>
            {/* 원장 본인은 doctor 파라미터를 서버에서 강제. 본인 이름을 chip으로 readonly 노출 */}
            <input type="hidden" name="doctor" value={doctorSlugParam} />
            <span className="h-9 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-soft)] px-3 text-sm font-medium text-[var(--text)]">
              {ownDoctorName ?? doctorSlugParam}
              <span className="text-[10px] font-normal text-[var(--text-muted)]">
                본인 글
              </span>
            </span>
          </>
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
            href={`/admin/cards${buildQueryString({
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
                  {/* 2026-05-28: whitespace-nowrap — 좁은 칸에서 2줄로 깨지지 않게 1줄 강제. */}
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">좋아요</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">조회수</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">저장</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">댓글</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">공유</th>
                  <th className="px-3 py-2 text-left font-medium">생성일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // 2026-05-28: deleted_at IS NOT NULL 이면 상태 라벨 '삭제' 로 override
                  //   (사용자 보고 — 옛 동작: deleted 탭에서도 발행/대기 등 원 status 표시되어 혼란).
                  //   복구 흐름은 본문(EditClient) 의 "올리기" 로 일원화. Pick 위치는 PickToggle 만.
                  const style = r.deleted_at
                    ? STATUS_STYLE.deleted
                    : (STATUS_STYLE[r.status] ?? STATUS_STYLE_FALLBACK);
                  // 시술 리포트(review_summary)는 자동 집계물 → 편집 진입 차단.
                  //   클릭 시 빈 편집화면 대신 공개 리포트(/reports/{slug})로, slug 없으면 비클릭.
                  const isReport = r.category === "review_summary";
                  const editHref = `/admin/cards/${r.id}/edit`;
                  const linkHref = isReport
                    ? r.post_slug
                      ? `/reports/${r.post_slug}`
                      : null
                    : editHref;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-soft)]"
                    >
                      <td className="px-3 py-2 align-middle text-[var(--text-muted)]">
                        {linkHref ? (
                          <Link
                            href={linkHref}
                            className="hover:text-[var(--primary)] hover:underline"
                            title={isReport ? "공개 리포트 보기(편집 불가)" : undefined}
                          >
                            #{r.id}
                          </Link>
                        ) : (
                          <span title="시술 리포트는 자동 집계물이라 편집할 수 없어요.">#{r.id}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-center">
                        <PickToggle cardId={r.id} initial={!!r.is_pick} />
                      </td>
                      <td className="px-3 py-2 align-middle">
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
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-[var(--text-secondary)]">
                        {/* v4: 포스팅이면 카테고리만 표기 (꿀팁/피부일기/물어봐요/새소식),
                            Q&A이면 'Q&A'. 컬럼 가로폭 절약. */}
                        {r.type === "qa"
                          ? "Q&A"
                          : labelForCategory(r.category) || "끄적끄적"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-[var(--text)]">
                        {/* 글쓴이 — 의사 글이면 원장 이름, 그 외엔 닉네임(handle/display_name) */}
                        {r.doctor ? (
                          <span>{r.doctor.name}</span>
                        ) : r.author ? (
                          <span>
                            {r.author.display_name ?? r.author.handle ?? "—"}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-[var(--text)]">
                        {linkHref ? (
                          <Link
                            href={linkHref}
                            className="block hover:text-[var(--primary)] hover:underline"
                            title={isReport ? "공개 리포트 보기(편집 불가)" : r.title}
                          >
                            {truncate(r.title ?? "", 50)}
                          </Link>
                        ) : (
                          <span className="block" title="시술 리포트는 자동 집계물이라 편집할 수 없어요.">
                            {truncate(r.title ?? "", 50)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.like_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.view_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.save_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.comments_count?.[0]?.count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.share_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-[var(--text-muted)]">
                        {formatYmd(r.created_at)}
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
                href={`/admin/cards${buildQueryString({
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
                    href={`/admin/cards${buildQueryString({
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
                    href={`/admin/cards${buildQueryString({
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
                    href={`/admin/cards${buildQueryString({
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
                href={`/admin/cards${buildQueryString({
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
