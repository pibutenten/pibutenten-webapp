import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import BetaAdminCardsView, {
  type BetaAdminCardRow,
  type BetaAdminCardsDoctorOption,
} from "./BetaAdminCardsView";

/**
 * /beta-skin/admin/cards — 베타 스킨 "전체 글 관리" (Phase 3 ②-a).
 *
 * 원칙: UI 는 베타 스킨 톤(BetaAdminCardsView), 데이터·필터 로직·RPC·운영 클라 컴포넌트는 운영 /admin/cards 와 동일.
 *   - 이 서버 페이지는 운영 admin/cards/page.tsx 의 가드(requireAdminPage)·searchParams 파싱·권한 분기
 *     (isAdmin / isActiveDoctor)·doctor 본인 강제필터·상태별 카운트·본 목록 fetch 로직을 그대로 복제한다.
 *   - 렌더만 BetaAdminCardsView(클라 셸 래퍼)로 위임 — row·counts·doctors·필터값을 props 로 전달.
 *   - searchParams 키(status/type/category/q/doctor/pick/page/sort/dir)는 운영과 100% 동일.
 *
 * 보안: doctor admin 은 본인 글만(운영과 동일 — DB 쿼리 단계에서 본인 doctor_id 강제 + URL 조작 차단).
 *   가드·필터 누수 없게 운영 page.tsx 로직을 1:1 이식.
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)이 글로벌 크롬을 덮음.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 전체 글 관리",
  robots: { index: false, follow: false },
};

// ── 운영 admin/cards/page.tsx 와 동일 타입·가드 헬퍼 ──
type QAStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived"
  | "hidden";
type TypeFilter = "qa" | "post" | "review" | "review_summary" | "all";
type StatusFilter = QAStatus | "all" | "deleted";
type CategoryFilter = "doodle" | "all";

type DoctorOption = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

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

// 헤더 클릭 정렬 — 키→DB 컬럼(운영 동일). 댓글은 관계 집계라 제외.
const SORTABLE_COLS: Record<string, string> = {
  like: "like_count",
  view: "view_count",
  save: "save_count",
  share: "share_count",
  created: "created_at",
};

type Props = {
  searchParams: Promise<{
    status?: string;
    type?: string;
    category?: string;
    q?: string;
    doctor?: string;
    pick?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
};

export default async function BetaAdminCardsPage({ searchParams }: Props) {
  const sp = await searchParams;

  // 권한 분기(운영 admin/cards/page.tsx 와 동일 — active 단위 ADR 0012):
  //   active=admin role → super admin(전체 카드, 전체 원장 dropdown)
  //   active=doctor + 매핑 → 본인 doctor 모드(본인 글만)
  const guard = await requireAdminPage("/beta-skin/admin/cards");
  const supabase = await createSupabaseServerClient();
  const isActiveDoctor =
    guard.active?.role === ROLES.DOCTOR && !!guard.activeDoctorId;
  const isAdmin = guard.isSuperAdmin && !isActiveDoctor;

  // 본인 doctor 정보 lookup — active 가 doctor 면 강제 본인 doctor 필터링용(운영 동일).
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

  // ── 쿼리 파라미터 파싱(운영 동일) ──
  const statusParam = isStatusFilter(sp.status) ? sp.status : "all";
  const typeParam: TypeFilter = isTypeFilter(sp.type) ? sp.type : "all";
  const categoryParam: CategoryFilter = isCategoryFilter(sp.category)
    ? sp.category
    : "all";
  const qParam = (sp.q ?? "").trim();
  // 원장 본인 접근 — doctor 파라미터를 본인 slug 로 강제(URL 조작으로 타 원장 글 열람 차단).
  const doctorSlugParam = isAdmin
    ? (sp.doctor ?? "").trim()
    : (ownDoctorSlug ?? "");
  const pickOnly = sp.pick === "1";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const sortKey = sp.sort && SORTABLE_COLS[sp.sort] ? sp.sort : "created";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const orderCol = SORTABLE_COLS[sortKey];

  // ── 원장 목록(필터 dropdown용 — 관리자만, 운영 동일) ──
  const doctorsListResult = isAdmin
    ? await supabase
        .from("doctors")
        .select("id, slug, name, branch")
        .order("sort_order", { ascending: true })
        .returns<DoctorOption[]>()
    : { data: [] as DoctorOption[] };
  const doctors: DoctorOption[] = doctorsListResult.data ?? [];

  // doctor slug → id 매핑(필터용, 운영 동일).
  let doctorIdFilter: string | null = null;
  if (isAdmin) {
    if (doctorSlugParam) {
      const found = doctors.find((d) => d.slug === doctorSlugParam);
      doctorIdFilter = found?.id ?? null;
    }
  } else {
    // 원장 본인 접근 — DB 쿼리 단계에서 본인 doctor_id 로 강제 필터.
    doctorIdFilter = ownDoctorId;
  }

  // ── 상태별 카운트(탭 표시용, 운영 countByStatus 동일) ──
  async function countByStatus(s: StatusFilter): Promise<number> {
    let qb = supabase
      .from("cards")
      .select("id", { count: "exact", head: true });
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

  const statusCounts: Record<StatusFilter, number> = {
    all: cAll,
    draft: cDraft,
    pending_review: cPending,
    published: cPublished,
    archived: cArchived,
    hidden: cHidden,
    deleted: cDeleted,
  };

  // ── 본 목록 쿼리(운영 동일) ──
  let listQuery = supabase
    .from("cards")
    .select(
      `id, status, type, category, post_slug, is_pick, title, body, like_count, view_count, save_count, share_count, created_at, deleted_at,
       comments_count:comments(count),
       doctor:doctors(slug, name, branch),
       author:profiles!cards_author_id_profiles_fkey(display_name, handle)`,
      { count: "exact" },
    );

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
    listQuery = listQuery.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }

  const {
    data: rowsData,
    count: totalCount,
    error: listError,
  } = await listQuery
    .order(orderCol, { ascending: sortDir === "asc" })
    .range(offset, offset + PAGE_SIZE - 1)
    .returns<BetaAdminCardRow[]>();

  const rows: BetaAdminCardRow[] = rowsData ?? [];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const doctorOptions: BetaAdminCardsDoctorOption[] = doctors.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
  }));

  return (
    <BetaAdminCardsView
      isAdmin={isAdmin}
      rows={rows}
      statusCounts={statusCounts}
      doctors={doctorOptions}
      ownDoctorName={ownDoctorName}
      statusParam={statusParam}
      typeParam={typeParam}
      categoryParam={categoryParam}
      qParam={qParam}
      doctorSlugParam={doctorSlugParam}
      pickOnly={pickOnly}
      sortKey={sortKey}
      sortDir={sortDir}
      pageNum={pageNum}
      totalPages={totalPages}
      total={total}
      listError={listError ? listError.message : null}
    />
  );
}
