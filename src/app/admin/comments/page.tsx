import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import CommentsClient, { type CommentRow } from "./CommentsClient";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/comments");
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin)) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  // 전체 카운트 + 첫 페이지 댓글 동시 fetch
  const [{ count }, { data: rows }] = await Promise.all([
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible"),
    supabase
      .from("comments")
      .select(
        `id, body, created_at, card_id,
         card:cards(question, shortcode),
         author:author_id(handle, display_name)`,
      )
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(FIRST_PAGE_SIZE + 1),
  ]);

  const total = count ?? 0;
  const initialRows = ((rows ?? []) as unknown) as CommentRow[];
  const hasMore = initialRows.length > FIRST_PAGE_SIZE;
  const firstPage = initialRows.slice(0, FIRST_PAGE_SIZE);

  return (
    <section className="w-full py-6">
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
