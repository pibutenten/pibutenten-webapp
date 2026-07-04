import type { Metadata } from "next";
import FeedView from "@/components/skin/FeedView";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { blendQaQuota, diversifyByDoctor } from "@/lib/feed-shuffle";
import { type ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";
import { getFeedSidebarDataCached } from "@/lib/feed-sidebar-cached";
import { unstable_cache } from "next/cache";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { FEED_CAT_LABELS, parseFeedCat, type FeedCat } from "@/lib/feed-categories";

/**
 * 메인 피드(/) — "카테고리 탭 = /?cat= 서버 풀, URL 이 SSOT" 모델 (2026-07-03 전환).
 *   (2026-06-14 앱 스킨 승격: 홈을 신규 스킨 FeedView 로 교체. SEO(index·JSON-LD·H1)는 구 홈 그대로 보존.)
 *  - 전체(/): feed_cards_scored 300 + Q&A 전용 300 을 동시 조회해 blendQaQuota 로 "매 20장 중
 *    Q&A 6장 이상" 슬롯 보장(원장 확정 2026-07-04 — 시술후기 대량 유입 시 Q&A 소멸 방지).
 *    카테고리 탭(/?cat=qa|review|doodle): 같은 RPC 에 p_category 를
 *    더해 그 카테고리만의 300 풀을 서버가 내려줌(마이그 0326). 종전 "풀 1개를 탭이 클라 필터" 모델은
 *    시술후기 대량 유입(2026-06)으로 풀이 한 카테고리에 도배되면 다른 탭이 비는 구조적 한계가 있었음.
 *    FeedView 의 클라 필터(matchesChip)는 탭 전환 중 임시 표시용으로만 유지.
 *  - 검색(?q=): search_cards_scored 300 — 검색 결과 풀(검색바·URL 유지, cat 무시).
 *    검색어가 시술명과 매칭되면 '전체' 탭 맨 위에 시술 리포트 1장(searchReport, getProcedureReport).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// 줄세우기(랭킹)는 ORDER 깊이만큼 한 번에 계산 → "순서(카드 ID 목록)"만 가볍게 저장하고,
//   화면엔 처음 INITIAL 장만 전체 데이터로 렌더(초기 무거운 SSR 방지). 스크롤 시 같은 순서대로
//   ID 로 다음 묶음을 이어 받음(/api/cards?ids=) → 경계 순서 어긋남 없이 안정적 + 가벼움.
const ORDER = 300;
const INITIAL = 20;

// 전체(/) 피드 Q&A 슬롯 보장 — 원장 확정 2026-07-04: "매 20장 중 Q&A 6장 이상".
//   카테고리 탭(/?cat=)에는 미적용(전체 풀만). DB 가중치(0327 qa x3)와 부보완 관계.
const QA_MIN_PER_WINDOW = 6;
const QA_WINDOW = 20;

/* 홈 카테고리 탭(/?cat=) 슬러그·라벨·검증 — FeedView 칩과 공유하는 SSOT(@/lib/feed-categories).
 *   (검수 반영 2026-07-03: 서버·클라 각자 정의하던 중복을 공유 모듈로 추출 — drift 방지.) */
/* 사이드 '인기 태그' — 공용 getFeedSidebarDataCached(@/lib/feed-sidebar-cached, 5분 캐시)에서
 *   popularTags 만 사용(홈/토픽 공용 단일 출처 — 구 홈 전용 getPopularTagsCached 를 승격). */

/** 비검색 홈 피드 풀(feed_cards_scored jitter 0.35 + 의사 분산). 매 방문 300행 점수계산이 임계경로였음 →
 *  쿠키리스 anon + unstable_cache(90s)로 분리(SNS 표준: 피드는 분 단위로 갱신, 매 클릭 재계산 안 함).
 *  공개 콘텐츠(어느 사용자나 동일 풀)만 캐시 — per-user 좋아요/저장(viewerStates)은 FeedView 가 마운트 후
 *  /api/viewer-states 로 클라 배치 조회하므로 캐시 본문엔 개인 데이터 미포함(캐시 오염·N+1 없음). 자른 신선도는 디렉터 승인(엄청 신선 불필요). */
const getHomeFeedPoolCached = unstable_cache(
  async (category: FeedCat | null): Promise<CardData[]> => {
    const sb = createSupabaseAnonClient();
    // 카테고리 풀(/?cat=)일 때만 p_category 를 더해 그 카테고리 300개를 서버가 점수순으로 내려줌.
    //   blend 미적용 — Q&A 슬롯 보장은 전체(category null) 풀만 대상.
    if (category) {
      const { data, error } = await sb.rpc("feed_cards_scored", {
        p_limit: ORDER,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
        p_category: category,
      });
      if (error) {
        console.error("[home] 피드 풀 조회 실패:", error.message);
        return [];
      }
      const scored = (data ?? []) as CardData[];
      return diversifyByDoctor(scored, { maxPerDoctorInHead: 1, headSize: 4 });
    }
    // 전체(category null): 전체 풀(종전과 동일한 4개 인자 — p_category 를 아예 안 보내 마이그 0326
    //   적용 전에 이 코드가 먼저 배포돼도 무사) + Q&A 전용 풀을 동시 조회 → blendQaQuota 로
    //   "매 QA_WINDOW 장 중 Q&A 최소 QA_MIN_PER_WINDOW 장" 슬롯 보장(원장 확정 2026-07-04) 후
    //   기존 의사 분산(diversifyByDoctor) 적용. Q&A 풀 조회 실패 시 빈 큐 폴백 — 전체 풀 그대로.
    const [allRes, qaRes] = await Promise.all([
      sb.rpc("feed_cards_scored", {
        p_limit: ORDER,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
      }),
      sb.rpc("feed_cards_scored", {
        p_limit: ORDER,
        p_offset: 0,
        p_half_life_days: 14,
        p_jitter_amp: 0.35,
        p_category: "qa",
      }),
    ]);
    if (allRes.error) {
      // 전체 풀 실패 = 피드 자체 불가 — 종전 패턴대로 즉시 빈 배열(검수 반영: blend 로 흘리지 않음).
      console.error("[home] 피드 풀 조회 실패:", allRes.error.message);
      return [];
    }
    if (qaRes.error) {
      // Q&A 풀만 실패 — 빈 큐 폴백으로 blend 가 organic 전용으로 degrade(슬롯 보장만 꺼짐).
      console.error("[home] Q&A 풀 조회 실패:", qaRes.error.message);
    }
    const scored = (allRes.data ?? []) as CardData[];
    const qaScored = (qaRes.data ?? []) as CardData[];
    const blended = blendQaQuota(scored, qaScored, {
      minPerWindow: QA_MIN_PER_WINDOW,
      windowSize: QA_WINDOW,
    });
    return diversifyByDoctor(blended, { maxPerDoctorInHead: 1, headSize: 4 });
  },
  // 인자(category)는 unstable_cache 가 키에 자동 포함 — v3 은 전체 풀 내부 조합 변경(Q&A blend 추가)에
  //   따른 명시적 버전업(v2 캐시 본문과 구성이 달라 stale 반환 방지).
  ["home-feed-pool-v3"],
  { revalidate: 90, tags: ["home-feed"] },
);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  // 검색 결과 화면(?q=)은 noindex,follow — 구 /search 정책과 동일(중복·thin 콘텐츠 차단).
  if (query) {
    return {
      title: { absolute: `'${query}' 검색 결과 | 피부텐텐` },
      robots: { index: false, follow: true },
      alternates: { canonical: `${SITE_URL}/` },
    };
  }

  // 카테고리 피드(/?cat=)는 내부 내비게이션 URL — 검색(?q=)과 동일 원칙으로 noindex,follow,
  //   canonical 은 홈(/). 색인 가치는 홈·상세가 담당하고 파라미터 URL 은 색인에서 제외(밸브 원칙).
  const cat = parseFeedCat(sp.cat);
  if (cat) {
    return {
      title: { absolute: `'${FEED_CAT_LABELS[cat]}' 피드 | 피부텐텐` },
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
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  // 카테고리 탭(/?cat=) — URL 이 SSOT. 검색(?q=)이 있으면 무시(검색이 우선, 동시 필터 미지원).
  const cat = parseFeedCat(sp.cat);

  // 카드 조회와 독립인 쿼리(hotIds)는 먼저 띄워 병렬화.
  const hotIdsPromise = getHotQaIds(20);

  let cards: CardData[] = [];
  // 검색 결과엔 시술 리포트를 띄우지 않는다(피드/리포트 탭 분리, 2026-06-29) — 항상 null.
  const searchReport: ProcedureReport | null = null;
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
    // 검색 결과엔 시술 리포트(searchReport)를 띄우지 않는다 — 피드/리포트 탭 분리(2026-06-29)로
    //   리포트는 /reports 탭 전용. 검색은 피드 글상자(qa/review/doodle)만. searchReport 는 null 유지.
    const [listRes, sidebarData] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: ORDER }),
      getFeedSidebarDataCached(),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    popularTags = sidebarData.popularTags;
  } else {
    // 피드 풀·인기태그 모두 공개 데이터 → 쿠키리스 anon + unstable_cache(피드 90s, 태그 300s)로 분리.
    //   매 방문 돌던 300행 점수계산(feed_cards_scored)을 캐시에서 즉시 반환(SNS 표준: 피드는 분 단위
    //   갱신). per-user 좋아요/저장은 FeedView 가 클라에서 배치 조회.
    //   /?cat= 이면 그 카테고리 전용 300 풀(캐시 키에 cat 자동 포함 — 카테고리별 별도 캐시).
    const [feedCards, sidebarData] = await Promise.all([
      getHomeFeedPoolCached(cat),
      getFeedSidebarDataCached(),
    ]);
    cards = feedCards;
    popularTags = sidebarData.popularTags;
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
  //   카테고리 피드(/?cat=)도 생략(SEO 검수 반영 2026-07-03) — noindex 파라미터 URL 에 지점 엔티티를
  //   연결할 이유가 없고, 엔티티 신호는 홈(/) 한 곳에 집중.
  const clinicsJsonLd = query || cat
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
        /* ⚠ key 에 cat 을 넣지 말 것 — 카테고리 전환(/?cat=)은 재마운트 없이 prop 변경 → FeedView 의
           풀 리셋 effect + poolEpochRef(stale loadMore 폐기 가드)가 처리한다. key 로 재마운트시키면
           epoch ref 연속성이 끊겨 가드가 무력화되고 전환 애니메이션·스크롤 복원도 깨진다(재검수 명기). */
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
