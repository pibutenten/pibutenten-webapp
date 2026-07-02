/**
 * feed-sidebar-cached — 피드 사이드바 공용 데이터(인기 태그 + 인기 Q&A) 5분 캐시.
 *
 * 홈(/)의 구 getPopularTagsCached 와 동일 패턴: 쿠키리스 anon 클라 + unstable_cache 로,
 * 페이지(홈·/topics/{tag}) 매 요청마다 돌던 300건 feed_cards_scored '사이드바 전용' 호출을
 * 제거(PERF). 풀은 jitter 0(결정적) — 클릭·재방문에 목록 불변이라 캐시 적합.
 *   - popularTags: topKeywords 빈도순 상위 16(feed-sidebar-data SSOT).
 *   - hotQa: 의사 qa 카드 상위 20(점수순 그대로).
 * 피드 본문 RPC(jitter>0, 매 방문 신선)는 이 캐시와 무관(불변).
 */

import { unstable_cache } from "next/cache";
import type { CardData } from "@/lib/types/card";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { topKeywords } from "@/components/skin/feed-sidebar-data";

export type FeedSidebarData = {
  /** 사이드 '인기 태그' '전체' 탭 — 빈도순 16개. */
  popularTags: string[];
  /** 사이드 '인기 Q&A' 후보 풀 — 의사 qa 카드 상위 20. */
  hotQa: CardData[];
};

export const getFeedSidebarDataCached = unstable_cache(
  async (): Promise<FeedSidebarData> => {
    const sb = createSupabaseAnonClient();
    const { data, error } = await sb.rpc("feed_cards_scored", {
      p_limit: 300,
      p_offset: 0,
      p_half_life_days: 14,
      p_jitter_amp: 0, // 사이드바 풀은 결정적(클릭/재방문에 목록 불변)
    });
    if (error) {
      console.error("[feed-sidebar] 사이드바 풀 조회 실패:", error.message);
      return { popularTags: [], hotQa: [] };
    }
    const scored = (data ?? []) as CardData[];
    return {
      popularTags: topKeywords(scored),
      hotQa: scored
        .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
        .slice(0, 20),
    };
  },
  ["feed-sidebar-v1"],
  { revalidate: 300, tags: ["popular-tags"] },
);
