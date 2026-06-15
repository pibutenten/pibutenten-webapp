/**
 * feed-sidebar-data — 피드 사이드바 공용 순수 유틸(서버·클라 공용, "use client" 아님).
 *
 * topKeywords 는 서버 컴포넌트(홈/토픽/리포트 page.tsx)에서 호출하므로, "use client" 인
 * FeedSidebar.tsx 가 아니라 이 일반 모듈에 둔다. (client 모듈의 함수를 서버에서 호출하면
 * client reference 라 런타임 throw — 그 회귀를 방지.)
 */

import type { CardData } from "@/lib/types/card";

/** 사이드 '인기 태그' 표시 개수 — 홈/토픽/리포트 공통. */
export const POPULAR_TAGS = 16;

/** 카드 배열에서 keywords 빈도 순위 상위 N개. 홈 page.tsx 와 동일 공식(서버에서 호출). */
export function topKeywords(cards: CardData[], limit = POPULAR_TAGS): string[] {
  const freq = new Map<string, number>();
  for (const c of cards) {
    for (const k of c.keywords ?? []) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, limit);
}
