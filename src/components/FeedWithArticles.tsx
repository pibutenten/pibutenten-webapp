"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QACard, { type QACardData } from "./QACard";
import ArticleSectionCard from "./ArticleSectionCard";
import type { ArticleSectionVirtualCard } from "@/lib/article/types";

type MixedItem =
  | { kind: "qa"; data: QACardData }
  | { kind: "article-section"; data: ArticleSectionVirtualCard };

type Props = {
  initialQas: QACardData[];
  initialArticleCards: ArticleSectionVirtualCard[];
  pageSize?: number;
  searchQuery?: string;
  doctorSlug?: string;
  boostDoctorSlug?: string;
  hotIds?: number[];
};

/**
 * QA 피드 + Article 섹션 카드를 섞어 보여주는 피드.
 * - QA는 페이지네이션 (기존 /api/qas)
 * - Article 섹션 카드는 초기 한 번 로드 (피드 페이지에서 서버가 분할해서 전달)
 * - 4번째 카드마다 article 섹션 1개 끼워넣음 (남는 article은 끝에 붙임)
 */
export default function FeedWithArticles({
  initialQas,
  initialArticleCards,
  pageSize = 20,
  searchQuery,
  doctorSlug,
  boostDoctorSlug,
  hotIds,
}: Props) {
  const hotSet = new Set(hotIds ?? []);
  // initialQas 자체에 동일 id가 여러 번 들어올 수 있어 mount 시 dedup
  const [qaItems, setQaItems] = useState<QACardData[]>(() => {
    const seen = new Set<number>();
    return initialQas.filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
  });
  const [hasMore, setHasMore] = useState(initialQas.length >= pageSize);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const stateRef = useRef({
    qaItems,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  });
  stateRef.current = {
    qaItems,
    hasMore,
    pageSize,
    searchQuery,
    doctorSlug,
    boostDoctorSlug,
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const {
      qaItems: cur,
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
      // 중복 id 제거 — loadMore가 이미 있는 id를 또 fetch해도 react key 충돌 안 남
      setQaItems((prev) => {
        const seen = new Set(prev.map((q) => q.id));
        const fresh = next.filter((q) => !seen.has(q.id));
        return [...prev, ...fresh];
      });
      if (next.length < ps) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

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

  // qa + article 섹션 카드 섞기 — 4번째 카드마다 article 섹션 1개
  const mixed: MixedItem[] = mixItems(qaItems, initialArticleCards);

  // 좌·우 칼럼 분리
  const left = mixed.filter((_, i) => i % 2 === 0);
  const right = mixed.filter((_, i) => i % 2 === 1);

  return (
    <>
      {/* 모바일 */}
      <div className="flex flex-col gap-4 min-[900px]:hidden">
        {mixed.map((it) => (
          <Item
            key={keyFor(it)}
            item={it}
            activeQuery={searchQuery}
            boostDoctorSlug={doctorSlug}
            hotSet={hotSet}
          />
        ))}
      </div>

      {/* 데스크탑 */}
      <div className="hidden grid-cols-2 items-start gap-5 min-[900px]:grid">
        <div className="flex flex-col gap-5">
          {left.map((it) => (
            <Item
              key={keyFor(it)}
              item={it}
              activeQuery={searchQuery}
              boostDoctorSlug={doctorSlug}
              hotSet={hotSet}
            />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {right.map((it) => (
            <Item
              key={keyFor(it)}
              item={it}
              activeQuery={searchQuery}
              boostDoctorSlug={doctorSlug}
              hotSet={hotSet}
            />
          ))}
        </div>
      </div>

      <div ref={sentinelRef} className="h-10" />
      {loading && (
        <div className="py-4 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      )}
      {!hasMore && qaItems.length > 0 && (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">
          마지막 글입니다 · 총 {qaItems.length}개
        </div>
      )}
    </>
  );
}

function Item({
  item,
  activeQuery,
  boostDoctorSlug,
  hotSet,
}: {
  item: MixedItem;
  activeQuery?: string;
  boostDoctorSlug?: string;
  hotSet: Set<number>;
}) {
  if (item.kind === "qa") {
    return (
      <QACard
        qa={item.data}
        activeQuery={activeQuery}
        boostDoctorSlug={boostDoctorSlug}
        isHot={hotSet.has(item.data.id)}
      />
    );
  }
  return <ArticleSectionCard card={item.data} activeQuery={activeQuery} />;
}

function keyFor(it: MixedItem): string {
  if (it.kind === "qa") return `qa-${it.data.id}`;
  return `art-${it.data.articleId}-${it.data.sectionIndex}`;
}

/**
 * QA 배열에 article-section 카드를 4번째마다 끼워넣음.
 * 다 못 쓴 article-section은 마지막에 차례로 붙임.
 */
function mixItems(
  qas: QACardData[],
  articles: ArticleSectionVirtualCard[],
): MixedItem[] {
  if (articles.length === 0) {
    return qas.map((q) => ({ kind: "qa", data: q }));
  }
  const out: MixedItem[] = [];
  let articleIdx = 0;
  for (let i = 0; i < qas.length; i++) {
    out.push({ kind: "qa", data: qas[i] });
    // 4개마다 article 1개 (i=3 → 4번째 카드 다음)
    if (i > 0 && (i + 1) % 4 === 0 && articleIdx < articles.length) {
      out.push({ kind: "article-section", data: articles[articleIdx] });
      articleIdx++;
    }
  }
  // 남은 article 섹션은 끝에
  while (articleIdx < articles.length) {
    out.push({ kind: "article-section", data: articles[articleIdx] });
    articleIdx++;
  }
  return out;
}
