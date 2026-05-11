import type { Metadata } from "next";
import HeroSearch from "@/components/HeroSearch";
import CategoryWithChips from "@/components/CategoryWithChips";
import Feed from "@/components/Feed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const INITIAL_PAGE_SIZE = 20;

const SITE = SITE_URL;

type Props = {
  searchParams: Promise<{ q?: string; boost?: string }>;
};

/**
 * 홈페이지 메타.
 *  - 검색어(?q=...) 있을 때는 noindex (중복 색인·thin content 방지)
 *  - 메인 진입은 index 허용, canonical 자기 자신
 */
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // /search 페이지 — 검색 쿼리와 무관하게 영구 noindex (spec A-2, B-2)
  if (q) {
    return {
      title: `"${q}" 검색 결과`,
      description: `"${q}" 관련 피부과 전문의 답변과 칼럼을 모아봅니다.`,
      alternates: { canonical: `${SITE}/search` },
      robots: { index: false, follow: true },
    };
  }
  return {
    title: "검색",
    description: "피부과 전문의 답변에서 원하는 키워드를 검색하세요.",
    alternates: { canonical: `${SITE}/search` },
    robots: { index: false, follow: true },
  };
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const boost = (sp.boost ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // v5.1: 검색어 로그 기록 (인기 검색어 통계용) — q가 있을 때만, fire-and-forget
  if (q && q.length <= 100) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    void supabase
      .from("search_logs")
      .insert({ query: q, profile_id: user?.id ?? null })
      .then(() => {
        /* 실패해도 검색은 진행 */
      });
  }

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

  // 같은 원장 3연속 방지 — 2연속까지만 허용, 3번째에는 다른 원장 끼워넣기
  // (홈/검색 모두 적용. 원장 개인 페이지는 별도 라우트라 영향 없음)
  if (qas.length >= 3) {
    const remaining = [...qas];
    const reordered: QACardData[] = [];
    while (remaining.length > 0) {
      const last = reordered[reordered.length - 1];
      const prev = reordered[reordered.length - 2];
      const lastTwoSameSlug =
        last !== undefined &&
        prev !== undefined &&
        last.doctor?.slug !== undefined &&
        last.doctor?.slug === prev.doctor?.slug;
      if (lastTwoSameSlug) {
        const idx = remaining.findIndex(
          (it) => it.doctor?.slug !== last.doctor?.slug,
        );
        if (idx >= 0) {
          reordered.push(remaining.splice(idx, 1)[0]);
          continue;
        }
      }
      reordered.push(remaining.shift() as QACardData);
    }
    qas = reordered;
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

  // viewer prefetch — 좋아요/저장/평점 즉시 표시
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const { fetchViewerStates } = await import("@/lib/viewer-states");
  const vsMap = await fetchViewerStates(
    supabase,
    viewer?.id ?? null,
    (qas ?? []).map((q) => q.id),
  );
  const viewerStates: Record<number, { liked?: boolean; saved?: boolean; rating?: number }> = {};
  for (const [id, st] of vsMap) viewerStates[id] = st;

  return (
    <section>
      <HeroSearch />

      {/* 카테고리 — 데스크탑은 위 여백 더 (HeroSearch와 거리), 모바일은 그대로 */}
      <div className="mt-6 sm:mt-12">
        <CategoryWithChips popularByCategory={popularByCategory} />
      </div>

      {q && (
        <p className="mt-10 text-left text-sm text-[var(--text-secondary)] sm:mt-12">
          <span className="font-bold text-[var(--primary)]">“{q}”</span>
          에 대한 <span className="font-bold">{count ?? qas?.length ?? 0}</span>
          개의 답변
        </p>
      )}

      <div className={q ? "mt-5" : "mt-4 sm:mt-14"}>
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
          <Feed
            initial={qas}
            pageSize={INITIAL_PAGE_SIZE}
            searchQuery={q || undefined}
            boostDoctorSlug={boost || undefined}
            hotIds={hotIds}
            viewerStates={viewerStates}
            key={`${q || "all"}::${boost || ""}`}
          />
        )}
      </div>
    </section>
  );
}
