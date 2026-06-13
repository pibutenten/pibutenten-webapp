import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getReviewSummaryFeedPool,
  getProcedureReport,
} from "@/lib/procedure-report";
import type { ProcedureReport } from "@/lib/procedure-report";
import { fetchCardList } from "@/lib/search-query";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import type { CardData } from "@/lib/types/card";
import BetaSkinFeed from "./BetaSkinFeed";

/**
 * /beta-skin — 신규 디자인 컨셉으로 리스킨한 홈 피드 프리뷰.
 *
 * 운영과 격리:
 *   - 운영 파일 무수정. 이 라우트(app/beta-skin/*)만 신규 생성.
 *   - 데이터 로딩은 운영 홈(app/page.tsx)과 동일:
 *       전체 = feed_cards_scored 300 (+ diversifyByDoctor) / 검색(?q=) = fetchCardList 300.
 *       리포트 풀(getReviewSummaryFeedPool)·검색 리포트(getProcedureReport)·viewer 상태도 운영과 동일.
 *   - 시각적 격리는 클라이언트(BetaSkinFeed)가 position:fixed 풀뷰포트로 처리.
 *   - 검색엔진 노출 차단(robots noindex,nofollow) — 어디까지나 미리보기.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기",
  robots: { index: false, follow: false },
};

// 줄세우기(랭킹)는 ORDER 깊이만큼 한 번에 계산 → "순서(카드 ID 목록)"만 가볍게 저장하고,
//   화면엔 처음 INITIAL 장만 전체 데이터로 렌더. 스크롤 시 같은 순서대로 ID 로 다음 묶음을 이어 받음.
const ORDER = 300;
const INITIAL = 24;

export default async function BetaSkinPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; kw?: string }>;
}) {
  const sp = await searchParams;
  // RecordView 의 관심 키워드 칩이 /beta-skin?kw=키워드 로 보내므로, kw 도 검색어로 소비.
  const query = (sp.q ?? sp.kw ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  let cards: CardData[] = [];
  let reportPool: ProcedureReport[] = [];
  // 검색 시 시술명이 리포트와 매칭되면 '전체' 탭 첫 카드(후기 1건부터, getProcedureReport).
  let searchReport: ProcedureReport | null = null;

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
    const [listRes, pool, sReport] = await Promise.all([
      fetchCardList(supabase, { q: query, offset: 0, limit: ORDER }),
      getReviewSummaryFeedPool(supabase),
      getProcedureReport(supabase, query),
    ]);
    cards = (listRes.data ?? []) as unknown as CardData[];
    reportPool = pool;
    searchReport = sReport;
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
    cards = diversifyByDoctor((rpcRes.data ?? []) as unknown as CardData[], {
      maxPerDoctorInHead: 1,
      headSize: 4,
    }) as unknown as CardData[];
    reportPool = pool;
  }

  // 순서(랭킹) ID 목록은 전체(최대 ORDER), 화면 초기 렌더는 앞 INITIAL 장만.
  const orderedIds = cards.map((c) => c.id);
  const initialCards = cards.slice(0, INITIAL);

  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    initialCards.map((c) => c.id),
  );

  // 인기검색어/카테고리 인기태그/최근검색/자동완성은 헤더 검색 드롭다운(BetaDiscovery)이
  //   자체적으로 /api/beta-discover + localStorage 로 처리 → page 에서 별도 전달 불필요(운영 정합).

  return (
    <BetaSkinFeed
      initialPool={initialCards}
      orderedIds={orderedIds}
      reportPool={reportPool}
      searchReport={searchReport}
      searchQuery={query || undefined}
      viewerStates={viewerStates}
    />
  );
}
