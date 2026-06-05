"use client";

/**
 * ReportViewTracker — 시술 리포트 앵커(review_summary) 카드의 조회수 기록.
 *
 * 일반 단일 글과 **동일한** `useCardViewer` 경로를 재사용한다(새 방식 만들지 않음):
 *   recordView → card_views INSERT → DB 트리거가 cards.view_count 동기화.
 *   session dedup(`pibutenten:view:${id}`)으로 같은 세션 같은 앵커는 1회만.
 *
 * 트리거(디렉터 의도 "리포트 진입(더보기) = 1 조회"):
 *   - auto=true  (단독 /reports 페이지, variant="page"): mount 시 forceExpanded 로 1회 기록.
 *   - auto=false (피드·검색 삽입 카드): 펼침 시에만 부모가 이 컴포넌트를 mount → mount 시 1회 기록.
 *
 * 렌더 출력 없음(null). 저장·공유(ReportAnchorActions/useCardEngagement)와는 무관.
 */
import { useEffect, useRef } from "react";
import type { CardData } from "@/components/Card";
import { useCardViewer } from "@/components/card/hooks/useCardViewer";

export default function ReportViewTracker({
  card,
  auto,
}: {
  /** 앵커(review_summary) 카드. card_views 의 대상 card_id. */
  card: CardData;
  /** true=단독 페이지(mount 즉시) / false=삽입 카드(펼침 시 mount 됨). */
  auto: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const { recordView } = useCardViewer(card, { forceExpanded: auto, cardRef: ref });

  // 삽입 카드는 펼침 시에만 mount 되므로 mount 시 1회 기록.
  // 단독 페이지(auto=true)는 useCardViewer 가 forceExpanded 로 이미 기록 → 중복 호출 방지.
  useEffect(() => {
    if (!auto) recordView();
  }, [auto, recordView]);

  return null;
}
