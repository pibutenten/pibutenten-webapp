import type { Metadata } from "next";
import HeroSearch from "@/components/HeroSearch";
import CategoryWithChips from "@/components/CategoryWithChips";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { fetchCardList, resolveCategorySlug } from "@/lib/search-query";
import { categorize } from "@/lib/category-sets";
import { CATEGORIES } from "@/lib/categories";
import { getProcedureReport, getFamilyReviewCardIds } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import ReportSampleNotice from "@/components/report/ReportSampleNotice";

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

  // 배치 ⑤ H3 (2026-05-28): fetchCardList SSOT 헬퍼로 통일.
  //   /api/cards 무한스크롤과 동일 헬퍼 → 카테고리 라벨 검색 시 21번째 카드부터 다른
  //   결과 집합으로 바뀌는 H3 회귀 해소.
  const popularByCategoryPromise = getPopularByCategory();
  // 검색 카운트가 categorySlug 일 때는 category 직접 count, 아니면 텍스트 ILIKE.
  const categorySlug = resolveCategorySlug(q);

  const { data: rawCards, error } = await fetchCardList(supabase, {
    q,
    doctorSlug: null,
    boostDoctorSlug: boost || null,
    offset: 0,
    limit: INITIAL_PAGE_SIZE,
  });
  let cards = (rawCards ?? []) as CardData[];

  // 검색 결과 목록에서 시술 리포트 앵커(review_summary) 제외 — 최상단에 라이브 집계 리포트
  //   카드를 별도로 보여주므로 목록 중복 방지. (앵커 draft 동안엔 search RPC 가 이미 제외 → inert,
  //   published 플립 후 중복 방지로 실효.) 피드(home)는 그대로 노출(×2 의도 유지).
  cards = cards.filter((c) => (c.type as string | undefined) !== "review_summary");

  // 피드 다양화 — 검색 없을 때: head 1명/1회 / 검색 있을 때: head 1명/2회. 같은 원장 3연속 방지.
  // (홈/검색 모두 적용. 원장 개인 페이지는 별도 라우트라 영향 없음)
  cards = diversifyByDoctor(cards, {
    maxPerDoctorInHead: q ? 2 : 1,
    headSize: 4,
  });

  // 검색일 때만 카운트 별도 조회 — fetchCardList 와 동일 분기 (카테고리 vs 텍스트).
  let count: number | null = null;
  if (q && !error) {
    if (categorySlug) {
      // 카테고리 라벨 검색 — category 컬럼 count 만.
      const cRes = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("category", categorySlug);
      count = cRes.count ?? null;
    } else {
      let countQuery = supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("status", "published");
      const words = q.split(/\s+/).filter((w) => w.length > 0);
      for (const w of words) {
        // P1-⑥ (2026-05-29): ILIKE escape 보강. backslash 가 PostgreSQL ILIKE 의
        //   default escape 문자라 사용자 입력에 `\` 가 섞이면 다음 글자가 escape 처리됨.
        //   순서: (1) backslash → \\, (2) % _ 와일드카드 → \%, \_, (3) 메타 문자 → 공백.
        //   PostgREST `.ilike.` 는 ESCAPE 절 명시 불가 — backslash 자체가 default 라 호환.
        //   검색 정확도 개선 목적 (SQL injection 은 PostgREST parameterize 로 이미 안전).
        const escaped = w
          .replace(/\\/g, "\\\\")
          .replace(/[%_]/g, "\\$&")
          .replace(/[()[\],*]/g, " ");
        const pattern = `%${escaped}%`;
        countQuery = countQuery.or(
          `title.ilike.${pattern},body.ilike.${pattern},keywords.cs.{${w}}`,
        );
      }
      const cRes = await countQuery;
      count = cRes.count ?? null;
    }
  }

  // 시술 검색이면(=후기 있는 시술명) 결과 최상단에 시술 리포트 카드 노출.
  const report = q ? await getProcedureReport(supabase, q) : null;
  let reportReviews: CardData[] = [];
  if (report) {
    // 작업 D 롤업: 집계와 동일 procedure_ko family 기준(카드 id IN).
    const cardIds = await getFamilyReviewCardIds(supabase, q);
    if (cardIds.length > 0) {
      const { data } = await supabase
        .from("cards")
        .select(CARD_LIST_SELECT)
        .in("id", cardIds)
        .order("created_at", { ascending: false })
        .returns<CardData[]>();
      reportReviews = data ?? [];
    }
  }

  const popularByCategory = await popularByCategoryPromise;
  const hotIds = Array.from(await getHotQaIds(20));

  // viewer prefetch — 좋아요/저장 즉시 표시
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    (cards ?? []).map((q) => q.id),
  );

  // 시술 리포트 후기 — viewer 좋아요 여부 일괄 조회(단독 글과 같은 card_likes 행).
  const reportReviewLiked: Record<number, boolean> = {};
  if (reportReviews.length > 0) {
    const st = await fetchViewerStatesRecord(
      supabase,
      viewer?.id ?? null,
      reportReviews.map((r) => r.id),
    );
    for (const r of reportReviews) reportReviewLiked[r.id] = !!st[r.id]?.liked;
  }

  // 검색어 q의 칩 카테고리 색 — 같은 페이지 칩과 동일 SSOT(categorize → CATEGORIES.color).
  // 사전에 없으면 categorize 가 knowledge(피부상식)로 반환 → 그 색 그대로 사용.
  const catColor = CATEGORIES.find((c) => c.slug === categorize(q))?.color;

  return (
    <section>
      <HeroSearch />

      {/* 카테고리 — 데스크탑은 위 여백 더 (HeroSearch와 거리), 모바일은 그대로 */}
      <div className="mt-6 sm:mt-12">
        <CategoryWithChips popularByCategory={popularByCategory} />
      </div>

      {/* 시술 검색 — 결과 최상단(‘N개의 답변’ 헤더보다 위)에 시술 리포트 카드 한 장 */}
      {report && (
        <div className="mx-auto mb-5 mt-8 max-w-[680px] sm:mt-12">
          <ReportSampleNotice count={report.count} procedureKo={report.procedureKo} />
          <ProcedureReportCard report={report} reviews={reportReviews} reviewLiked={reportReviewLiked} />
        </div>
      )}

      {q && (
        <p className="mt-10 text-left text-sm text-[var(--text-secondary)] sm:mt-12">
          <span className="font-bold" style={{ color: catColor }}>“{q}”</span>
          에 대한 <span className="font-bold">{count ?? cards?.length ?? 0}</span>
          개의 답변
        </p>
      )}

      <div className={q ? "mt-5" : "mt-4 sm:mt-14"}>
        {error && (
          <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Q&A 불러오기 실패: {error.message}
          </div>
        )}
        {!error && (cards?.length ?? 0) === 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
            {q ? "검색 결과가 없습니다." : "등록된 Q&A가 없습니다."}
          </div>
        )}
        {!error && cards && cards.length > 0 && (
          <Feed
            initial={cards}
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
