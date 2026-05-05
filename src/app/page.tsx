import HeroSearch from "@/components/HeroSearch";
import CategoryTabs from "@/components/CategoryTabs";
import QACard, { type QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

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
    .limit(PAGE_SIZE)
    .returns<QACardData[]>();

  return (
    <section>
      {/* Hero (타이틀 + 검색창) — 클라이언트 컴포넌트 (포커스 시 슬라이드) */}
      <HeroSearch />

      {/* 카테고리 탭 (Hero 아래 24px 여백) */}
      <div className="mt-6">
        <CategoryTabs />
      </div>

      {/* Q&A 그리드 — 모바일 1단 / 데스크탑 2단 */}
      <div className="mt-6 grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-2 min-[900px]:gap-5">
        {error && (
          <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Q&A 불러오기 실패: {error.message}
          </div>
        )}
        {!error && qas && qas.length === 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
            등록된 Q&A가 없습니다.
          </div>
        )}
        {qas?.map((qa) => <QACard key={qa.id} qa={qa} />)}
      </div>
    </section>
  );
}
