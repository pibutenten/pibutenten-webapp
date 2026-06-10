/**
 * /beta 피드 탭 공유 상태 — 헤더 칩(BetaNav)과 피드 본문(BetaFeed)이 같은 "활성 탭"을 공유.
 *
 * 왜 URL 이 아니라 모듈 상태인가:
 *   탭 전환을 서버 왕복 없이 "폰 안에서 즉시" 처리하려면 URL 네비게이션(서버 재렌더)을 피해야 한다.
 *   useSyncExternalStore 로 구독 → 어느 컴포넌트(헤더 칩/피드)에서 set 해도 양쪽이 즉시 리렌더.
 *   (Provider 불필요 → 레이아웃 변경 없음. /beta 영역에서만 사용.)
 *
 * 검색(q)은 그대로 URL(?q=) 로 유지 — 이 store 는 "카테고리 탭"만 담당.
 */

import { useSyncExternalStore } from "react";

export type BetaTab = "" | "qa" | "review" | "doodle" | "review_summary";

let active: BetaTab = "";
const listeners = new Set<() => void>();

export function getBetaTab(): BetaTab {
  return active;
}

export function setBetaTab(tab: BetaTab) {
  if (tab === active) return;
  active = tab;
  listeners.forEach((l) => l());
}

/** SSR 일관: 서버에선 항상 "전체"(""). 마운트 후 클라 값으로 동기화. */
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBetaTab(): BetaTab {
  return useSyncExternalStore(subscribe, getBetaTab, () => "" as BetaTab);
}
