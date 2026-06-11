import type { Metadata } from "next";
import { headers } from "next/headers";
import BetaFeed from "@/components/beta/BetaFeed";
import type { CardData, CardDataList } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";

/**
 * 메인 피드(/) — "한 번에 300개 점수순으로 받아두고, 탭은 BetaFeed 가 브라우저에서 즉시 필터" 모델.
 *   (2026-06-11 메인 승격: 기존 /beta 앱이 루트로 이전. SEO(index·JSON-LD·H1)는 구 홈 그대로 보존.)
 *  - 전체: feed_cards_scored 300 (+ 리포트풀) — 탭(Q&A/시술후기/끄적끄적)은 이 풀을 클라 필터.
 *  - 검색(?q=): search_cards_scored 300 — 검색 결과 풀을 같은 방식으로 탭 필터(검색바·URL 유지).
 *  - 리포트 탭: BetaFeed 가 reportPool 로 렌더(검색 중이면 시술명 필터).
 *  탭 전환은 서버 왕복 없음(클라 store) → 동그라미 없이 즉시.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// 초기 풀 — 300장 전체 SSR 렌더는 너무 무거워(초기 HTML 거대, total 8~11s) 한 페이지 분량만.
//   랭킹(줄세우기)은 그대로 점수순이고, 나머지는 스크롤 시 같은 순서로 /api/cards 가 이어 받음.
const POOL = 30;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // 검색 결과 화면(?q=)은 noindex,follow — 구 /search 정책과 동일(중복·thin 콘텐츠 차단).
  if (query) {
    return {
      title: { absolute: `'${query}' 검색 결과 | 피부텐텐` },
      robots: { index: false, follow: true },
      alternates: { canonical: `${SITE_URL}/` },
    };
  }

  // 홈만 brand-first(absolute, 템플릿 미적용). description 의 전문의 수(D)는 라이브 동적.
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("doctors")
    .select("id", { count: "exact", head: true });
  const d = count ?? 0;
  const title = "피부텐텐 | 피부가 예뻐지는 모든 이야기";
  const description = `피부과 전문의 ${d}명이 리프팅·스킨부스터·안티에이징 시술 질문에 직접 답합니다. 시술별 후기 집계까지.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/`,
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "피부텐텐" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default async function HomeFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  // 카드 조회와 독립인 쿼리(ua·hotIds)는 먼저 띄워 병렬화.
  const hotIdsPromise = getHotQaIds(20);
  const uaPromise = headers().then((h) => h.get("user-agent") ?? "");

  let cards: CardData[] = [];
  let reportPool: ProcedureReport[] = [];
  const searchQuery = query || undefined;

  if (query) {
    // 검색어 로그(인기검색어 통계용) — fire-and-forget.
    if (query.length <= 100) {
      void supabase
        .from("search_logs")
        .insert({ query, profile_id: viewer?.id ?? null })
        .then(() => {
          /* 실패해도 진행 */
        });
    }
    const [listRes, pool] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: POOL }),
      getReviewSummaryFeedPool(supabase),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    reportPool = pool;
  } else {
    const [rpcRes, pool] = await Promise.all([
      supabase.rpc("feed_cards_scored", {
        p_limit: POOL,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
      }),
      getReviewSummaryFeedPool(supabase),
    ]);
    cards = diversifyByDoctor((rpcRes.data ?? []) as CardData[], {
      maxPerDoctorInHead: 1,
      headSize: 4,
    });
    reportPool = pool;
  }

  const [hotIdsArr, ua] = await Promise.all([hotIdsPromise, uaPromise]);
  const hotIds = Array.from(hotIdsArr);
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((c) => c.id),
  );

  // JSON-LD: 홈은 그룹 브랜드의 메인 진입점 — 5개 지점 MedicalClinic + 그룹 풀세트.
  //   layout.tsx 의 Organization/WebSite/그룹법인 외에 추가 inject. 검색 화면(?q=)에선 생략.
  const clinicsJsonLd = query
    ? null
    : { "@context": "https://schema.org", "@graph": allClinicsSchema() };

  return (
    <div className="pb-16 sm:pb-0">
      {clinicsJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(clinicsJsonLd) }}
        />
      )}
      {/* SEO/접근성 — 시각 표시는 헤더 로고가 담당, 스크린리더/봇용 H1 1개 보장 */}
      <h1 className="sr-only">
        피부텐텐 — 피부과 전문의가 답하는 피부 Q&amp;A 라운지
      </h1>
      <BetaFeed
        key={query ? `q:${query}` : "feed"}
        initialPool={cards as unknown as CardDataList[]}
        pageSize={20}
        searchQuery={searchQuery}
        reportPool={reportPool}
        hotIds={hotIds}
        viewerStates={viewerStates}
        initialMobile={isMobileUA}
      />
    </div>
  );
}
