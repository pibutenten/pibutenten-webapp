import HeroSearch from "@/components/HeroSearch";
import CategoryTabs from "@/components/CategoryTabs";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const INITIAL_PAGE_SIZE = 20;

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const { data: qas, error } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("published", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(INITIAL_PAGE_SIZE)
    .returns<QACardData[]>();

  return (
    <section>
      <HeroSearch />

      <div className="mt-6">
        <CategoryTabs />
      </div>

      <div className="mt-6">
        {error && (
          <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Q&A 불러오기 실패: {error.message}
          </div>
        )}
        {!error && (qas?.length ?? 0) === 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
            등록된 Q&A가 없습니다.
          </div>
        )}
        {!error && qas && qas.length > 0 && (
          <QAFeed initial={qas} pageSize={INITIAL_PAGE_SIZE} />
        )}
      </div>
    </section>
  );
}
