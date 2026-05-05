import HeroSearch from "@/components/HeroSearch";
import CategoryWithChips from "@/components/CategoryWithChips";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";

export const dynamic = "force-dynamic";

const INITIAL_PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // q 있으면 점수 RPC, 없으면 created_at 정렬
  const popularByCategoryPromise = getPopularByCategory();
  let qas: QACardData[] | null = null;
  let error: { message: string } | null = null;
  let count: number | null = null;

  if (q) {
    // 점수 기반 (search_qas_scored RPC)
    const res = await supabase.rpc("search_qas_scored", {
      p_q: q,
      p_doctor_slug: null,
      p_offset: 0,
      p_limit: INITIAL_PAGE_SIZE,
    });
    qas = (res.data ?? []) as QACardData[];
    error = res.error;

    // 검색 매칭 카운트는 별도로 (PostgREST OR + count)
    let countQuery = supabase
      .from("qas")
      .select("id", { count: "exact", head: true })
      .eq("published", true);
    const words = q.split(/\s+/).filter((w) => w.length > 0);
    for (const w of words) {
      const escaped = w.replace(/[%_*]/g, "\\$&").replace(/[(),]/g, " ");
      const pattern = `%${escaped}%`;
      countQuery = countQuery.or(
        `question.ilike.${pattern},answer.ilike.${pattern},keywords.cs.{${w}}`,
      );
    }
    const cRes = await countQuery;
    count = cRes.count ?? null;
  } else {
    // 영상 업로드일 기준 최신순 (videos.upload_date desc, id desc)
    const res = await supabase
      .from("qas")
      .select(
        `
        id, question, answer, meta, keywords,
        like_count, view_count,
        doctor:doctors(slug, name, branch),
        video:videos!inner(youtube_id, youtube_url, topic, upload_date)
      `,
      )
      .eq("published", true)
      .order("upload_date", { referencedTable: "videos", ascending: false })
      .order("id", { ascending: false })
      .limit(INITIAL_PAGE_SIZE)
      .returns<QACardData[]>();
    qas = res.data ?? [];
    error = res.error;
  }

  const popularByCategory = await popularByCategoryPromise;

  return (
    <section>
      <HeroSearch />

      <div className="mt-6">
        <CategoryWithChips popularByCategory={popularByCategory} />
      </div>

      {q && (
        <p className="mt-4 text-left text-sm text-[var(--text-secondary)]">
          <span className="font-bold text-[var(--primary)]">“{q}”</span>
          에 대한 <span className="font-bold">{count ?? qas?.length ?? 0}</span>
          개의 답변
        </p>
      )}

      <div className="mt-4">
        {error && (
          <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Q&A 불러오기 실패: {error.message}
          </div>
        )}
        {!error && (qas?.length ?? 0) === 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
            {q ? "검색 결과가 없습니다." : "등록된 Q&A가 없습니다."}
          </div>
        )}
        {!error && qas && qas.length > 0 && (
          <QAFeed
            initial={qas}
            pageSize={INITIAL_PAGE_SIZE}
            searchQuery={q || undefined}
            key={q || "all"}
          />
        )}
      </div>
    </section>
  );
}
