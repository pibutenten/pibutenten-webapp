import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { ROLES } from "@/lib/identity-shared";
import { type CommentRow } from "@/app/admin/comments/CommentsClient";
import BetaAdminCommentsView from "./BetaAdminCommentsView";

/**
 * /beta-skin/admin/comments — 베타 스킨 "전체 댓글" (Phase 3 ②-b).
 *
 * 원칙: UI 는 베타 스킨 톤(BetaAdminCommentsView), 데이터·필터 로직·무한스크롤 API·운영 클라
 *   컴포넌트(CommentsClient)는 운영 /admin/comments 와 동일.
 *   - 이 서버 페이지는 운영 admin/comments/page.tsx 의 가드(requireAdminPage)·status 탭(visible/hidden)·
 *     권한 분기(isAdmin / isActiveDoctor)·doctor admin 본인 카드 댓글 강제필터·count + 첫 페이지 prefetch
 *     로직을 그대로 복제한다.
 *   - 렌더만 BetaAdminCommentsView(클라 셸 래퍼)로 위임 — firstPage·hasMore·statusFilter·total 을 props 로 전달.
 *   - searchParams 키(status)는 운영과 100% 동일.
 *
 * 보안: doctor admin 은 본인 글에 달린 댓글만(운영과 동일 — DB 쿼리 단계에서 본인 카드 ID 집합으로 in 절 강제).
 *   가드·필터 누수 없게 운영 page.tsx 로직을 1:1 이식.
 *   무한스크롤 API(/api/admin/comments)는 super admin 만 통과 → doctor admin 은 첫 페이지(서버 prefetch)만
 *   보이는 운영 동작을 그대로 따른다(권한 누수 없음).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)이 글로벌 크롬을 덮음.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 전체 댓글",
  robots: { index: false, follow: false },
};

const FIRST_PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function BetaAdminCommentsPage({ searchParams }: Props) {
  const guard = await requireAdminPage("/beta-skin/admin/comments");
  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const statusFilter: "visible" | "hidden" =
    sp.status === "hidden" ? "hidden" : "visible";

  // 운영 admin/comments/page.tsx 와 동일 — active doctor 면 본인 카드 댓글만.
  // super admin 권한 묶음이라도 active=doctor 시 본인 한정(ADR 0012).
  const isActiveDoctor =
    guard.active?.role === ROLES.DOCTOR && !!guard.activeDoctorId;
  const isAdmin = guard.isSuperAdmin && !isActiveDoctor;

  // active doctor — 본인 카드 ID 집합 fetch (author_id OR doctor_id), 운영 동일.
  let myCardIds: number[] | null = null;
  if (!isAdmin && guard.activeDoctorId) {
    const [authorRes, doctorRes] = await Promise.all([
      supabase
        .from("cards")
        .select("id")
        .eq("author_id", guard.active.profileId),
      supabase.from("cards").select("id").eq("doctor_id", guard.activeDoctorId),
    ]);
    const s = new Set<number>();
    for (const r of (authorRes.data ?? []) as { id: number }[]) s.add(r.id);
    for (const r of (doctorRes.data ?? []) as { id: number }[]) s.add(r.id);
    myCardIds = Array.from(s);
  }

  // 카운트 + 첫 페이지 동시 fetch (active doctor 면 본인 카드 ID 집합으로 in 절), 운영 동일.
  let countQb = supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("status", statusFilter);
  let rowsQb = supabase
    .from("comments")
    .select(
      `id, body, created_at, card_id, status, screening_flags,
       card:cards(title, shortcode),
       author:profiles!comments_author_id_fkey(handle, display_name)`,
    )
    .eq("status", statusFilter)
    .order("created_at", { ascending: false })
    .limit(FIRST_PAGE_SIZE + 1);
  if (myCardIds !== null) {
    if (myCardIds.length === 0) {
      countQb = countQb.eq("card_id", -1);
      rowsQb = rowsQb.eq("card_id", -1);
    } else {
      countQb = countQb.in("card_id", myCardIds);
      rowsQb = rowsQb.in("card_id", myCardIds);
    }
  }
  const [{ count }, { data: rows }] = await Promise.all([countQb, rowsQb]);

  const total = count ?? 0;
  const initialRows = (rows ?? []) as unknown as CommentRow[];
  const hasMore = initialRows.length > FIRST_PAGE_SIZE;
  const firstPage = initialRows.slice(0, FIRST_PAGE_SIZE);

  return (
    <BetaAdminCommentsView
      firstPage={firstPage}
      hasMore={hasMore}
      statusFilter={statusFilter}
      total={total}
    />
  );
}
