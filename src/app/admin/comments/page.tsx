import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import CommentsClient, { type CommentRow } from "./CommentsClient";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "전체 댓글",
  robots: { index: false, follow: false },
};

const FIRST_PAGE_SIZE = 50;

/**
 * /admin/comments — 전체 visible 댓글.
 *
 * 패턴:
 *   - 같은 글에 달린 댓글들을 묶음으로 표시 (글 제목 1번 + 최근 댓글들)
 *   - 최신순 + 무한 스크롤 (`/api/admin/comments?before=...`)
 *   - 서버에서 첫 50개 prefetch → CommentsClient에 hydration
 */
export default async function AdminCommentsPage() {
  const guard = await requireAdminPage("/admin/comments");
  const supabase = await createSupabaseServerClient();

  // 2026-05-22: active doctor 면 본인 카드 댓글만. super admin 권한 묶음이라도 active=doctor 시 본인 한정.
  const isActiveDoctor =
    guard.active?.role === "doctor" && !!guard.activeDoctorId;
  const isAdmin = guard.isSuperAdmin && !isActiveDoctor;

  // active doctor — 본인 카드 ID 집합 fetch (author_id OR doctor_id)
  let myCardIds: number[] | null = null;
  if (!isAdmin && guard.activeDoctorId) {
    const [authorRes, doctorRes] = await Promise.all([
      supabase.from("cards").select("id").eq("author_id", guard.active.profileId),
      supabase.from("cards").select("id").eq("doctor_id", guard.activeDoctorId),
    ]);
    const s = new Set<number>();
    for (const r of (authorRes.data ?? []) as { id: number }[]) s.add(r.id);
    for (const r of (doctorRes.data ?? []) as { id: number }[]) s.add(r.id);
    myCardIds = Array.from(s);
  }

  // 카운트 + 첫 페이지 동시 fetch (active doctor 면 본인 카드 ID 집합으로 in 절)
  let countQb = supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("status", "visible");
  let rowsQb = supabase
    .from("comments")
    .select(
      `id, body, created_at, card_id,
       card:cards(question, shortcode),
       author:profiles!comments_author_id_fkey(handle, display_name)`,
    )
    .eq("status", "visible")
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
  const initialRows = ((rows ?? []) as unknown) as CommentRow[];
  const hasMore = initialRows.length > FIRST_PAGE_SIZE;
  const firstPage = initialRows.slice(0, FIRST_PAGE_SIZE);

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">전체 댓글</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          visible 상태 댓글 {total.toLocaleString()}건 · 글 단위로 묶어 최신순 표시
        </p>
      </div>

      <CommentsClient initial={firstPage} initialHasMore={hasMore} />
    </section>
  );
}
