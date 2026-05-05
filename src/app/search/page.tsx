import SearchBar from "@/components/SearchBar";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchProps) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
      { count: "exact" },
    )
    .eq("published", true);

  if (q) {
    const pattern = `%${q.replace(/[%_*]/g, "\\$&").replace(/[(),]/g, " ")}%`;
    query = query.or(`question.ilike.${pattern},answer.ilike.${pattern}`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE)
    .returns<QACardData[]>();

  return (
    <section className="space-y-5">
      <header className="space-y-3 pt-2">
        <SearchBar initialValue={q} />
        {q && !error && (
          <p className="text-center text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--primary)]">“{q}”</span>
            에 대한 <span className="font-bold">{count ?? 0}</span>개의 답변
          </p>
        )}
        {!q && (
          <p className="text-center text-sm text-[var(--text-muted)]">
            검색어를 입력해 보세요.
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          검색 실패: {error.message}
        </div>
      )}

      {q && !error && data && data.length === 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          검색 결과가 없습니다.
        </div>
      )}

      {q && !error && data && data.length > 0 && (
        <QAFeed initial={data} pageSize={PAGE_SIZE} searchQuery={q} />
      )}
    </section>
  );
}
