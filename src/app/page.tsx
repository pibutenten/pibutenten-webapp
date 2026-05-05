import HeroSearch from "@/components/HeroSearch";
import CategoryWithChips from "@/components/CategoryWithChips";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";
import { getHotQaIds } from "@/lib/hot-ids";

export const dynamic = "force-dynamic";

const INITIAL_PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ q?: string; boost?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const boost = (sp.boost ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // q 있을 때나 없을 때 모두 RPC 사용 — 일관된 정렬 (q: 점수+노이즈 / no-q: video.upload_date desc)
  // boost: 특정 원장 slug에 +300 가산 (원장님 단일 페이지에서 칩 클릭으로 넘어왔을 때)
  const popularByCategoryPromise = getPopularByCategory();
  const rpcRes = await supabase.rpc("search_qas_scored", {
    p_q: q,
    p_doctor_slug: null,
    p_offset: 0,
    p_limit: INITIAL_PAGE_SIZE,
    p_boost_doctor_slug: boost || null,
  });
  let qas = (rpcRes.data ?? []) as QACardData[];
  const error = rpcRes.error;

  // 첫 4카드 다양화 — 검색 없을 때: 모두 다른 원장 (max 1) / 검색 있을 때: 같은 원장 최대 2번
  if (qas.length > 4) {
    const maxPerDoctor = q ? 2 : 1;
    const counts = new Map<string, number>();
    const head: QACardData[] = [];
    const tail: QACardData[] = [];
    for (const it of qas) {
      const slug = it.doctor?.slug ?? "_unknown";
      const c = counts.get(slug) ?? 0;
      if (head.length < 4 && c < maxPerDoctor) {
        head.push(it);
        counts.set(slug, c + 1);
      } else {
        tail.push(it);
      }
    }
    qas = [...head, ...tail];
  }

  // 검색일 때만 카운트 별도 조회
  let count: number | null = null;
  if (q && !error) {
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
  }

  const popularByCategory = await popularByCategoryPromise;
  const hotIds = Array.from(await getHotQaIds(20));

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

      <div className="mt-4 sm:mt-10">
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
            boostDoctorSlug={boost || undefined}
            hotIds={hotIds}
            key={`${q || "all"}::${boost || ""}`}
          />
        )}
      </div>
    </section>
  );
}
