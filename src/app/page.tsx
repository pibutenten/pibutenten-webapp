import type { Metadata } from "next";
import FeedView from "@/components/skin/FeedView";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getProcedureReport, type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";
import { topKeywords } from "@/components/skin/feed-sidebar-data";
import { unstable_cache } from "next/cache";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

/**
 * 메인 피드(/) — "한 번에 300개 점수순으로 받아두고, 탭은 FeedView 가 브라우저에서 즉시 필터" 모델.
 *   (2026-06-14 앱 스킨 승격: 홈을 신규 스킨 FeedView 로 교체. SEO(index·JSON-LD·H1)는 구 홈 그대로 보존.)
 *  - 전체: feed_cards_scored 300 — 탭(Q&A/시술후기/끄적끄적)은 이 풀을 클라 필터.
 *  - 검색(?q=): search_cards_scored 300 — 검색 결과 풀을 같은 방식으로 탭 필터(검색바·URL 유지).
 *    검색어가 시술명과 매칭되면 '전체' 탭 맨 위에 시술 리포트 1장(searchReport, getProcedureReport).
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
/* 사이드 '인기 태그' '전체' 탭 표시 개수 + 집계 함수(topKeywords)는 SSOT 인
 *   @/components/skin/feed-sidebar-data 에서 import (홈/토픽/리포트 공용 단일 출처). */

/** 인기 태그 — 비검색 피드 풀(jitter 0, 결정적) 기준이라 자주 안 바뀜 → 5분 캐시.
 *  쿠키리스 anon 클라 + unstable_cache 로, 홈/검색 매 요청마다 돌던 300건 feed_cards_scored
 *  '2번째' 호출(인기태그 전용)을 제거(PERF, 2026-06-27). 피드 본문 RPC(jitter 0.35, 매 방문 신선)는 불변. */
const getPopularTagsCached = unstable_cache(
  async (): Promise<string[]> => {
    const sb = createSupabaseAnonClient();
    const { data, error } = await sb.rpc("feed_cards_scored", {
      p_limit: ORDER,
      p_offset: 0,
      p_half_life_days: 14,
      p_jitter_amp: 0,
    });
    if (error) {
      console.error("[home] 인기태그 풀 조회 실패:", error.message);
      return [];
    }
    return topKeywords((data ?? []) as CardData[]);
  },
  ["home-popular-tags-v1"],
  { revalidate: 300, tags: ["popular-tags"] },
);

/** 비검색 홈 피드 풀(feed_cards_scored jitter 0.35 + 의사 분산). 매 방문 300행 점수계산이 임계경로였음 →
 *  쿠키리스 anon + unstable_cache(90s)로 분리(SNS 표준: 피드는 분 단위로 갱신, 매 클릭 재계산 안 함).
 *  공개 콘텐츠(어느 사용자나 동일 풀)만 캐시 — per-user 좋아요/저장(viewerStates)은 FeedView 가 마운트 후
 *  /api/viewer-states 로 클라 배치 조회하므로 캐시 본문엔 개인 데이터 미포함(캐시 오염·N+1 없음). 자른 신선도는 디렉터 승인(엄청 신선 불필요). */
const getHomeFeedPoolCached = unstable_cache(
  async (): Promise<CardData[]> => {
    const sb = createSupabaseAnonClient();
    const { data, error } = await sb.rpc("feed_cards_scored", {
      p_limit: ORDER,
      p_offset: 0,
      p_half_life_days: 14,
      p_jitter_amp: 0.35,
    });
    if (error) {
      console.error("[home] 피드 풀 조회 실패:", error.message);
      return [];
    }
    const scored = (data ?? []) as CardData[];
    return diversifyByDoctor(scored, { maxPerDoctorInHead: 1, headSize: 4 });
  },
  ["home-feed-pool-v1"],
  { revalidate: 90, tags: ["home-feed"] },
);

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

  // 카드 조회와 독립인 쿼리(hotIds)는 먼저 띄워 병렬화.
  const hotIdsPromise = getHotQaIds(20);

  let cards: CardData[] = [];
  // 검색 시 시술명이 리포트와 매칭되면 '전체' 탭 첫 카드(후기 1건부터, getProcedureReport).
  let searchReport: ProcedureReport | null = null;
  // 사이드 '인기 태그' '전체' 탭 — 항상 비검색 피드 풀 기준(검색·태그클릭에 불변).
  let popularTags: string[] = [];
  const searchQuery = query || undefined;

  if (query) {
    // 검색 분기에서만 서버 클라(쿠키)·auth 조회 — search_logs 가 작성자(viewer)를 기록하므로.
    //   비검색 홈은 사용자 무관·경량(쿠키 파싱·auth 호출 없음).
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
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
    //   jitter=0(결정적) — 호출마다 무작위로 상위 풀이 바뀌면 인기태그 목록이 클릭/검색마다 바뀜.
    const [listRes, sReport, tags] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: ORDER }),
      getProcedureReport(supabase, query),
      getPopularTagsCached(),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    searchReport = sReport;
    popularTags = tags;
  } else {
    // 피드 풀·인기태그 모두 공개 데이터 → 쿠키리스 anon + unstable_cache(피드 90s, 태그 300s)로 분리.
    //   매 방문 돌던 300행 점수계산(feed_cards_scored)을 캐시에서 즉시 반환(SNS 표준: 피드는 분 단위
    //   갱신). per-user 좋아요/저장은 FeedView 가 클라에서 배치 조회.
    const [feedCards, tags] = await Promise.all([
      getHomeFeedPoolCached(),
      getPopularTagsCached(),
    ]);
    cards = feedCards;
    popularTags = tags;
  }

  // 순서(랭킹) ID 목록은 전체(최대 ORDER), 화면 초기 렌더는 앞 INITIAL 장만.
  const orderedIds = cards.map((c) => c.id);
  const initialCards = cards.slice(0, INITIAL);

  // 좋아요/저장(viewerStates)은 FeedView 가 마운트 후 /api/viewer-states 로 클라 배치 조회(per-user
  //   데이터를 SSR 에서 제거 → 비검색 홈은 사용자 무관·경량 렌더 + 캐시 본문 오염 없음). hotIds 만 대기.
  const hotIdsArr = await hotIdsPromise;
  const hotIds = Array.from(hotIdsArr);

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
      <FeedView
        key={query ? `q:${query}` : "feed"}
        initialPool={initialCards}
        orderedIds={orderedIds}
        searchQuery={searchQuery}
        searchReport={searchReport}
        popularTags={popularTags}
        hotIds={hotIds}
      />
    </div>
  );
}
