"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Masonry from "react-masonry-css";
import Card, { type CardDataList } from "./Card";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";

type ViewerState = { liked?: boolean; saved?: boolean };

type Props = {
  initial: CardDataList[];
  pageSize?: number;
  /** 검색어. 있으면 페이지네이션 시 ?q=...로 함께 호출 */
  searchQuery?: string;
  /** 특정 원장님으로 필터링. 페이지네이션 시 ?doctor_slug=... */
  doctorSlug?: string;
  /** 검색 점수 boost 대상 원장 slug (이 원장 글에 +150). 칩 클릭 시 카드에도 전달. */
  boostDoctorSlug?: string;
  /** HOT 카드의 ID 목록 (서버에서 계산) */
  hotIds?: number[];
  /** v4 — viewer의 좋아요/저장 상태 (card_id → state). server prefetch.
   * 카드별 client useEffect 호출 제거 → 첫 렌더부터 정확한 상태. */
  viewerStates?: Record<number, ViewerState>;
};

/**
 * 카드 피드 — 전체 카테고리(Q&A·포스팅·새소식·피부일기·물어봐요) 통합 표시.
 * 의사 글 + 회원 글 모두 같은 컴포넌트로 렌더.
 *
 * - 데스크탑(≥900px): 좌·우 두 칼럼 masonry (react-masonry-css 가로 flow)
 * - 모바일: 단일 칼럼
 * - 무한 스크롤: 하단 sentinel을 IntersectionObserver로 감지 → /api/cards?offset=...
 */
export default function Feed({
  initial,
  pageSize = 20,
  searchQuery,
  doctorSlug,
  boostDoctorSlug,
  hotIds,
  viewerStates,
}: Props) {
  const hotSet = new Set(hotIds ?? []);
  const [items, setItems] = useState<CardDataList[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length >= pageSize);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const stateRef = useRef({
    items,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  });
  stateRef.current = {
    items,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const {
      items: cur,
      hasMore: hm,
      pageSize: ps,
      searchQuery: sq,
      doctorSlug: ds,
      boostDoctorSlug: bd,
    } = stateRef.current;
    if (!hm) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: String(cur.length),
        limit: String(ps),
      });
      if (sq) params.set("q", sq);
      if (ds) params.set("doctor_slug", ds);
      if (bd) params.set("boost", bd);
      const res = await fetch(`/api/cards?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as { cards: CardDataList[] };
      const next = data.cards ?? [];
      setItems((prev) => [...prev, ...next]);
      if (next.length < ps) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // sentinel 관찰 — mount 시 한 번만 설정 (loadMore 안에서 ref로 최신 state 참조)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // 카드에서 글 삭제 시 — 즉시 client state에서 제거
  useEffect(() => {
    function onDeleted(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      setItems((prev) => prev.filter((q) => q.id !== id));
    }
    window.addEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
    return () =>
      window.removeEventListener(CARD_BUS_EVENTS.CARD_DELETED, onDeleted);
  }, []);

  return (
    <>
      {/* 카드 피드 — react-masonry-css 가로 flow.
          데스크탑(≥900px) 2-column, 모바일 1-column 자동. DOM 한 벌. */}
      <Masonry
        breakpointCols={{ default: 2, 899: 1 }}
        className="feed-masonry"
        columnClassName="feed-masonry__col"
      >
        {items.map((card) => (
          <Card
            key={card.id}
            card={card}
            activeQuery={searchQuery}
            boostDoctorSlug={doctorSlug}
            isHot={hotSet.has(card.id)}
            viewerLiked={viewerStates?.[card.id]?.liked}
            viewerSaved={viewerStates?.[card.id]?.saved}
          />
        ))}
      </Masonry>

      {/* 더 불러오기 sentinel + 로딩/끝 표시 */}
      <div ref={sentinelRef} className="h-10" />
      {loading && (
        <div className="py-4 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">
          마지막 글입니다 · 총 {items.length}개
        </div>
      )}
    </>
  );
}
