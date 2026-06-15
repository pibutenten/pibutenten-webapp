import type { Metadata } from "next";
import BetaSkinFeed from "@/app/beta-skin/BetaSkinFeed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool, getProcedureReport, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";

/**
 * 메인 피드(/) — "한 번에 300개 점수순으로 받아두고, 탭은 BetaSkinFeed 가 브라우저에서 즉시 필터" 모델.
 *   (2026-06-14 베타 스킨 승격: 홈을 신규 스킨 BetaSkinFeed 로 교체. SEO(index·JSON-LD·H1)는 구 홈 그대로 보존.)
 *  - 전체: feed_cards_scored 300 (+ 리포트풀) — 탭(Q&A/시술후기/끄적끄적)은 이 풀을 클라 필터.
 *  - 검색(?q=): search_cards_scored 300 — 검색 결과 풀을 같은 방식으로 탭 필터(검색바·URL 유지).
 *  - 리포트 탭: BetaSkinFeed 가 reportPool 로 렌더(검색 중이면 시술명 필터).
 *  탭 전환은 서버 왕복 없음(클라 store) → 동그라미 없이 즉시.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// 줄세우기(랭킹)는 ORDER 깊이만큼 한 번에 계산 → "순서(카드 ID 목록)"만 가볍게 저장하고,
//   화면엔 처음 INITIAL 장만 전체 데이터로 렌더(초기 무거운 SSR 방지). 스크롤 시 같은 순서대로
//   ID 로 다음 묶음을 이어 받음(/api/cards?ids=) → 경계 순서 어긋남 없이 안정적 + 가벼움.
const ORDER = 300;
const INITIAL = 20;
/* 사이드 '인기 태그' '전체' 탭 표시 개수 — BetaSkinFeed 가 그대로 사용(검색 중에도 재계산 안 함). */
const POPULAR_TAGS = 16;

/** 비검색 피드 풀의 keywords 빈도 순위 상위 N개. 검색과 무관하게 안정적(서버 단일 계산).
 *   클라(BetaSkinFeed)에서 검색결과 풀로 재계산하던 것을 서버 prop 으로 고정 → 태그 클릭으로
 *   순서·구성이 바뀌지 않음. (구 frozenTagsRef 클라 고정 로직 대체.) */
function topKeywords(cards: CardData[], limit = POPULAR_TAGS): string[] {
  const freq = new Map<string, number>();
  for (const c of cards) {
    for (const k of c.keywords ?? []) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, limit);
}

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

  // 카드 조회와 독립인 쿼리(hotIds)는 먼저 띄워 병렬화.
  const hotIdsPromise = getHotQaIds(20);

  let cards: CardData[] = [];
  let reportPool: ProcedureReport[] = [];
  // 검색 시 시술명이 리포트와 매칭되면 '전체' 탭 첫 카드(후기 1건부터, getProcedureReport).
  let searchReport: ProcedureReport | null = null;
  // 사이드 '인기 태그' '전체' 탭 — 항상 비검색 피드 풀 기준(검색·태그클릭에 불변).
  let popularTags: string[] = [];
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
    // 검색 화면 — 인기 태그는 검색결과가 아니라 '비검색 피드 풀' 기준으로 계산해야 안정적이므로
    //   keywords 집계 전용으로 feed_cards_scored 를 한 번 더 받는다(전체 탭 태그 = 검색과 무관).
    const [listRes, pool, sReport, tagPoolRes] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: ORDER }),
      getReviewSummaryFeedPool(supabase),
      getProcedureReport(supabase, query),
      supabase.rpc("feed_cards_scored", {
        p_limit: ORDER,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
      }),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    reportPool = pool;
    searchReport = sReport;
    if (tagPoolRes.error)
      console.error("[home] 인기태그 풀 조회 실패:", tagPoolRes.error.message);
    popularTags = topKeywords((tagPoolRes.data ?? []) as CardData[]);
  } else {
    const [rpcRes, pool] = await Promise.all([
      supabase.rpc("feed_cards_scored", {
        p_limit: ORDER,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
      }),
      getReviewSummaryFeedPool(supabase),
    ]);
    const scored = (rpcRes.data ?? []) as CardData[];
    cards = diversifyByDoctor(scored, {
      maxPerDoctorInHead: 1,
      headSize: 4,
    });
    reportPool = pool;
    // 인기 태그는 diversify(머리 4장 다양화) 전 원본 점수순 풀 기준 — 순서 안정.
    popularTags = topKeywords(scored);
  }

  // 순서(랭킹) ID 목록은 전체(최대 ORDER), 화면 초기 렌더는 앞 INITIAL 장만.
  const orderedIds = cards.map((c) => c.id);
  const initialCards = cards.slice(0, INITIAL);

  const hotIdsArr = await hotIdsPromise;
  const hotIds = Array.from(hotIdsArr);
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    initialCards.map((c) => c.id),
  );

  // JSON-LD: 홈은 그룹 브랜드의 메인 진입점 — 5개 지점 MedicalClinic + 그룹 풀세트.
  //   layout.tsx 의 Organization/WebSite/그룹법인 외에 추가 inject. 검색 화면(?q=)에선 생략.
  const clinicsJsonLd = query
    ? null
    : { "@context": "https://schema.org", "@graph": allClinicsSchema() };

  return (
    <div>
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
      <BetaSkinFeed
        key={query ? `q:${query}` : "feed"}
        initialPool={initialCards}
        orderedIds={orderedIds}
        searchQuery={searchQuery}
        reportPool={reportPool}
        searchReport={searchReport}
        popularTags={popularTags}
        hotIds={hotIds}
        viewerStates={viewerStates}
      />
    </div>
  );
}
