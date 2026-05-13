import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "전체 댓글",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  qa_id: string;
  author_profile_id: string | null;
  qas: { id: string; slug: string | null; question: string | null } | null;
  profiles: { handle: string | null; display_name: string | null } | null;
};

/**
 * /admin/comments — 전체 visible 댓글 리스트.
 * 프로필 댓글 탭과 동일한 카드 구조: 원본 글 제목 → "댓글" 라벨 + 본문.
 */
export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/comments");
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin)) {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { data: rows, count } = await supabase
    .from("comments")
    .select(
      `id, body, created_at, qa_id, author_profile_id,
       qas:qa_id(id, slug, question),
       profiles:author_profile_id(handle, display_name)`,
      { count: "exact" }
    )
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const comments = (rows ?? []) as unknown as CommentRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="w-full py-6">
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">전체 댓글</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          visible 상태 댓글 {total.toLocaleString()}건 · 최신순
        </p>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">댓글이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const qaTitle = c.qas?.question ?? "(제목 없음)";
            const qaHref = c.qas?.slug
              ? `/q/${c.qas.slug}`
              : `/q/${c.qa_id}`;
            const authorHandle = c.profiles?.handle ?? null;
            const authorName =
              c.profiles?.display_name ?? authorHandle ?? "(알 수 없음)";
            return (
              <li
                key={c.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4"
              >
                <Link
                  href={qaHref}
                  className="block text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                >
                  {qaTitle}
                </Link>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                    댓글
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {authorHandle ? (
                      <Link
                        href={`/${authorHandle}`}
                        className="hover:underline"
                      >
                        @{authorHandle}
                      </Link>
                    ) : (
                      authorName
                    )}
                    {" · "}
                    {new Date(c.created_at).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {c.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/comments?page=${page - 1}`}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              ← 이전
            </Link>
          )}
          <span className="text-xs text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/comments?page=${page + 1}`}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              다음 →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
