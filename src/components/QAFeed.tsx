"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QACard, { type QACardData } from "./QACard";

type Props = {
  initial: QACardData[];
  pageSize?: number;
  /** 검색어. 있으면 페이지네이션 시 ?q=...로 함께 호출 */
  searchQuery?: string;
  /** 특정 원장님으로 필터링. 페이지네이션 시 ?doctor_slug=... */
  doctorSlug?: string;
  /** 검색 점수 boost 대상 원장 slug (이 원장 글에 +150). 칩 클릭 시 카드에도 전달. */
  boostDoctorSlug?: string;
  /** HOT 카드의 ID 목록 (서버에서 계산) */
  hotIds?: number[];
};

/**
 * Q&A 피드.
 * - 데스크탑(≥900px): 좌·우 두 칼럼이 독립 (마손리 느낌, 좌우좌우 alternating)
 * - 모바일: 단일 칼럼
 * - 무한 스크롤: 하단 sentinel을 IntersectionObserver로 감지 → /api/qas?offset=...
 */
export default function QAFeed({
  initial,
  pageSize = 20,
  searchQuery,
  doctorSlug,
  boostDoctorSlug,
  hotIds,
}: Props) {
  const hotSet = new Set(hotIds ?? []);
  const [items, setItems] = useState<QACardData[]>(initial);
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
      const res = await fetch(`/api/qas?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as { qas: QACardData[] };
      const next = data.qas ?? [];
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
    window.addEventListener("pibutenten:qa-deleted", onDeleted);
    return () =>
      window.removeEventListener("pibutenten:qa-deleted", onDeleted);
  }, []);

  // alternating split (홀수 → 좌, 짝수 → 우) — 데스크탑 전용
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);

  return (
    <>
      {/* 모바일: 단일 칼럼 */}
      <div className="flex flex-col gap-4 min-[900px]:hidden">
        {items.map((qa) => (
          <QACard
            key={qa.id}
            qa={qa}
            activeQuery={searchQuery}
            boostDoctorSlug={doctorSlug}
            isHot={hotSet.has(qa.id)}
          />
        ))}
      </div>

      {/* 데스크탑: 좌·우 독립 칼럼 */}
      <div className="hidden grid-cols-2 items-start gap-5 min-[900px]:grid">
        <div className="flex flex-col gap-5">
          {left.map((qa) => (
            <QACard
              key={qa.id}
              qa={qa}
              activeQuery={searchQuery}
              boostDoctorSlug={doctorSlug}
            />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {right.map((qa) => (
            <QACard
              key={qa.id}
              qa={qa}
              activeQuery={searchQuery}
              boostDoctorSlug={doctorSlug}
            />
          ))}
        </div>
      </div>

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
